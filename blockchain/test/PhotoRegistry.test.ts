// A PhotoRegistry okosszerződés tesztjei (Mocha + ethers.js + Chai).
// Forrás: a Hardhat 3 „mocha-ethers” projektsablonjának test/Counter.ts mintája és a Hardhat
// dokumentációja (network.create(), networkHelpers.loadFixture), https://hardhat.org/docs – adaptálva.
import { expect } from 'chai';
import { keccak256, sha256, toUtf8Bytes, ZeroHash } from 'ethers';
import { network } from 'hardhat';

const { ethers, networkHelpers } = await network.create();

/** Egy „kép” SHA-256 tartalom-hash-e – a tesztben egy szövegből képezve. */
const contentHashOf = (label: string): string => sha256(toUtf8Bytes(label));

/** Álnevesített tulajdonos-azonosító: keccak256(felhasználói azonosító). */
const ownerRefOf = (userId: string): string => keccak256(toUtf8Bytes(userId));

const CONTENT_HASH = contentHashOf('teszt-kep-1.jpg');
const OTHER_CONTENT_HASH = contentHashOf('teszt-kep-2.jpg');
/** 64 bites perceptuális hash (dHash), a szerződésben bytes8. */
const PERCEPTUAL_HASH = '0x8f3c1a2b4d5e6f70';
const EMPTY_PERCEPTUAL_HASH = '0x0000000000000000';
const OWNER_REF = ownerRefOf('3f1c2a9e-5b7d-4e2f-9a61-0c8d7e6b5a41');
const OTHER_OWNER_REF = ownerRefOf('7a2b9c4d-1e3f-4a5b-8c6d-9e0f1a2b3c4d');
/** Egy regisztráció gázkerete; a mért érték ennél jóval kisebb. */
const MAX_REGISTRATION_GAS = 100_000n;

async function deployPhotoRegistryFixture() {
  const [owner, otherAccount] = await ethers.getSigners();
  const registry = await ethers.deployContract('PhotoRegistry');
  return { registry, owner, otherAccount };
}

describe('PhotoRegistry', function () {
  describe('telepítés', function () {
    it('a telepítő lesz a szerződés tulajdonosa', async function () {
      const { registry, owner } = await networkHelpers.loadFixture(deployPhotoRegistryFixture);

      expect(await registry.owner()).to.equal(owner.address);
    });
  });

  describe('registerPhoto', function () {
    it('regisztrál egy új képet, és kibocsátja a PhotoRegistered eseményt', async function () {
      const { registry } = await networkHelpers.loadFixture(deployPhotoRegistryFixture);
      const registeredAt = (await networkHelpers.time.latest()) + 60;
      await networkHelpers.time.setNextBlockTimestamp(registeredAt);

      await expect(registry.registerPhoto(CONTENT_HASH, PERCEPTUAL_HASH, OWNER_REF))
        .to.emit(registry, 'PhotoRegistered')
        .withArgs(CONTENT_HASH, OWNER_REF, PERCEPTUAL_HASH, BigInt(registeredAt));
    });

    it('elmenti a rekordot: tulajdonos-azonosító, perceptuális hash, időbélyeg', async function () {
      const { registry } = await networkHelpers.loadFixture(deployPhotoRegistryFixture);
      const registeredAt = (await networkHelpers.time.latest()) + 60;
      await networkHelpers.time.setNextBlockTimestamp(registeredAt);

      await registry.registerPhoto(CONTENT_HASH, PERCEPTUAL_HASH, OWNER_REF);
      const record = await registry.getRecord(CONTENT_HASH);

      expect(record.ownerRef).to.equal(OWNER_REF);
      expect(record.perceptualHash).to.equal(PERCEPTUAL_HASH);
      expect(record.registeredAt).to.equal(BigInt(registeredAt));
    });

    it('ugyanazt a tartalom-hash-t másodszor elutasítja (AlreadyRegistered)', async function () {
      const { registry } = await networkHelpers.loadFixture(deployPhotoRegistryFixture);
      await registry.registerPhoto(CONTENT_HASH, PERCEPTUAL_HASH, OWNER_REF);

      await expect(registry.registerPhoto(CONTENT_HASH, PERCEPTUAL_HASH, OTHER_OWNER_REF))
        .to.be.revertedWithCustomError(registry, 'AlreadyRegistered')
        .withArgs(CONTENT_HASH);
    });

    it('eltérő tartalom-hash-t azonos perceptuális hash-sel elfogad (a hasonlóságot a szerver szűri)', async function () {
      const { registry } = await networkHelpers.loadFixture(deployPhotoRegistryFixture);
      await registry.registerPhoto(CONTENT_HASH, PERCEPTUAL_HASH, OWNER_REF);

      await expect(registry.registerPhoto(OTHER_CONTENT_HASH, PERCEPTUAL_HASH, OWNER_REF)).to.emit(
        registry,
        'PhotoRegistered',
      );
    });

    it('a nulla tartalom-hash-t elutasítja (ZeroContentHash)', async function () {
      const { registry } = await networkHelpers.loadFixture(deployPhotoRegistryFixture);

      await expect(
        registry.registerPhoto(ZeroHash, PERCEPTUAL_HASH, OWNER_REF),
      ).to.be.revertedWithCustomError(registry, 'ZeroContentHash');
    });

    it('a nulla tulajdonos-azonosítót elutasítja (ZeroOwnerRef)', async function () {
      const { registry } = await networkHelpers.loadFixture(deployPhotoRegistryFixture);

      await expect(
        registry.registerPhoto(CONTENT_HASH, PERCEPTUAL_HASH, ZeroHash),
      ).to.be.revertedWithCustomError(registry, 'ZeroOwnerRef');
    });

    it('a tulajdonoson kívül senki sem regisztrálhat (OwnableUnauthorizedAccount)', async function () {
      const { registry, otherAccount } = await networkHelpers.loadFixture(
        deployPhotoRegistryFixture,
      );

      await expect(
        registry.connect(otherAccount).registerPhoto(CONTENT_HASH, PERCEPTUAL_HASH, OWNER_REF),
      )
        .to.be.revertedWithCustomError(registry, 'OwnableUnauthorizedAccount')
        .withArgs(otherAccount.address);
      expect(await registry.isRegistered(CONTENT_HASH)).to.equal(false);
    });
  });

  // L30: a tulajdonjog (Ownable) kezelése – a platform-kulcs kompromittálódásának következményei is
  // ezen múlnak: a tulajdonos átruházhatja és fel is adhatja a regisztráció jogát
  describe('tulajdonjog', function () {
    it('a tulajdonjogot más nem ruházhatja át és nem adhatja fel', async function () {
      const { registry, owner, otherAccount } = await networkHelpers.loadFixture(
        deployPhotoRegistryFixture,
      );

      await expect(registry.connect(otherAccount).transferOwnership(otherAccount.address))
        .to.be.revertedWithCustomError(registry, 'OwnableUnauthorizedAccount')
        .withArgs(otherAccount.address);
      await expect(registry.connect(otherAccount).renounceOwnership())
        .to.be.revertedWithCustomError(registry, 'OwnableUnauthorizedAccount')
        .withArgs(otherAccount.address);
      expect(await registry.owner()).to.equal(owner.address);
    });

    it('átruházás után csak az új tulajdonos regisztrálhat, a régi nem', async function () {
      const { registry, owner, otherAccount } = await networkHelpers.loadFixture(
        deployPhotoRegistryFixture,
      );

      await expect(registry.transferOwnership(otherAccount.address))
        .to.emit(registry, 'OwnershipTransferred')
        .withArgs(owner.address, otherAccount.address);

      await expect(registry.registerPhoto(CONTENT_HASH, PERCEPTUAL_HASH, OWNER_REF))
        .to.be.revertedWithCustomError(registry, 'OwnableUnauthorizedAccount')
        .withArgs(owner.address);
      await registry.connect(otherAccount).registerPhoto(CONTENT_HASH, PERCEPTUAL_HASH, OWNER_REF);
      expect(await registry.isRegistered(CONTENT_HASH)).to.equal(true);
    });

    it('a nulla címre nem ruházható át (az a lemondás lenne)', async function () {
      const { registry } = await networkHelpers.loadFixture(deployPhotoRegistryFixture);

      await expect(registry.transferOwnership(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(registry, 'OwnableInvalidOwner')
        .withArgs(ethers.ZeroAddress);
    });

    it('lemondás után senki nem regisztrálhat – a meglévő rekordok olvashatók maradnak', async function () {
      const { registry } = await networkHelpers.loadFixture(deployPhotoRegistryFixture);
      await registry.registerPhoto(CONTENT_HASH, PERCEPTUAL_HASH, OWNER_REF);

      await registry.renounceOwnership();

      expect(await registry.owner()).to.equal(ethers.ZeroAddress);
      await expect(
        registry.registerPhoto(OTHER_CONTENT_HASH, PERCEPTUAL_HASH, OTHER_OWNER_REF),
      ).to.be.revertedWithCustomError(registry, 'OwnableUnauthorizedAccount');
      expect(await registry.isRegistered(CONTENT_HASH)).to.equal(true);
    });
  });

  describe('lekérdezések', function () {
    it('isRegistered: regisztráció előtt false, utána true', async function () {
      const { registry } = await networkHelpers.loadFixture(deployPhotoRegistryFixture);

      expect(await registry.isRegistered(CONTENT_HASH)).to.equal(false);
      await registry.registerPhoto(CONTENT_HASH, PERCEPTUAL_HASH, OWNER_REF);
      expect(await registry.isRegistered(CONTENT_HASH)).to.equal(true);
    });

    it('getRecord: nem regisztrált hash-re üres rekordot ad', async function () {
      const { registry } = await networkHelpers.loadFixture(deployPhotoRegistryFixture);

      const record = await registry.getRecord(CONTENT_HASH);

      expect(record.ownerRef).to.equal(ZeroHash);
      expect(record.perceptualHash).to.equal(EMPTY_PERCEPTUAL_HASH);
      expect(record.registeredAt).to.equal(0n);
    });
  });

  describe('gázfelhasználás', function () {
    it(`egy regisztráció ${MAX_REGISTRATION_GAS} gáz alatt marad`, async function () {
      const { registry } = await networkHelpers.loadFixture(deployPhotoRegistryFixture);

      const tx = await registry.registerPhoto(CONTENT_HASH, PERCEPTUAL_HASH, OWNER_REF);
      const receipt = await tx.wait();
      if (receipt === null) {
        throw new Error('A tranzakcióhoz nem érkezett nyugta');
      }

      expect(receipt.gasUsed < MAX_REGISTRATION_GAS).to.equal(true);
    });
  });
});
