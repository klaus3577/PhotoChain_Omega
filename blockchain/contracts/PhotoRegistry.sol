// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

// Forrás: OpenZeppelin Contracts 5.x – Access Control / Ownable (MIT licenc),
// https://docs.openzeppelin.com/contracts/5.x/access-control
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title PhotoRegistry – fotók eredetiségének nyilvántartása
/// @notice A PhotoChain platform minden új kép SHA-256 tartalom-hash-ét itt rögzíti. Egy
///         tartalom-hash csak egyszer regisztrálható, így ugyanaz a fájl nem kerülhet fel újra.
/// @dev A láncra csak hash-ek kerülnek, se a kép, se személyes adat: a tulajdonost egy
///      álnevesített azonosító (ownerRef = keccak256(felhasználói azonosító)) jelöli.
///      Regisztrálni csak a szerződés tulajdonosa, a platform szerverének tárcája tud.
contract PhotoRegistry is Ownable {
    /// @notice Egy regisztrált kép adatai.
    /// @dev Két tárhelyszeletet (storage slot) foglal: az ownerRef (32 bájt) az elsőt, a
    ///      perceptualHash (8 bájt) és a registeredAt (8 bájt) együtt a másodikat.
    struct PhotoRecord {
        bytes32 ownerRef;
        bytes8 perceptualHash;
        uint64 registeredAt;
    }

    /// @dev Tartalom-hash (SHA-256) → rekord. A registeredAt == 0 jelenti, hogy nincs regisztrálva.
    mapping(bytes32 contentHash => PhotoRecord record) private _records;

    /// @notice Új kép regisztrációja történt.
    event PhotoRegistered(
        bytes32 indexed contentHash,
        bytes32 indexed ownerRef,
        bytes8 perceptualHash,
        uint64 registeredAt
    );

    /// @notice A tartalom-hash már regisztrálva van.
    error AlreadyRegistered(bytes32 contentHash);
    /// @notice A tartalom-hash nem lehet nulla.
    error ZeroContentHash();
    /// @notice A tulajdonos-azonosító nem lehet nulla.
    error ZeroOwnerRef();

    /// @notice A telepítő (deployer) lesz a szerződés tulajdonosa.
    constructor() Ownable(msg.sender) {}

    /// @notice Egy új kép regisztrálása.
    /// @param contentHash A képfájl SHA-256 hash-e.
    /// @param perceptualHash A kép 64 bites perceptuális hash-e (dHash).
    /// @param ownerRef A feltöltő álnevesített azonosítója (keccak256(felhasználói azonosító)).
    function registerPhoto(
        bytes32 contentHash,
        bytes8 perceptualHash,
        bytes32 ownerRef
    ) external onlyOwner {
        if (contentHash == bytes32(0)) revert ZeroContentHash();
        if (ownerRef == bytes32(0)) revert ZeroOwnerRef();
        if (_records[contentHash].registeredAt != 0) revert AlreadyRegistered(contentHash);

        uint64 registeredAt = uint64(block.timestamp);
        _records[contentHash] = PhotoRecord({
            ownerRef: ownerRef,
            perceptualHash: perceptualHash,
            registeredAt: registeredAt
        });

        emit PhotoRegistered(contentHash, ownerRef, perceptualHash, registeredAt);
    }

    /// @notice Regisztrálva van-e már a megadott tartalom-hash.
    /// @param contentHash A képfájl SHA-256 hash-e.
    /// @return Igaz, ha a hash már szerepel a nyilvántartásban.
    function isRegistered(bytes32 contentHash) external view returns (bool) {
        return _records[contentHash].registeredAt != 0;
    }

    /// @notice Egy regisztrált kép rekordja.
    /// @param contentHash A képfájl SHA-256 hash-e.
    /// @return A rekord; nem regisztrált hash esetén minden mezője nulla.
    function getRecord(bytes32 contentHash) external view returns (PhotoRecord memory) {
        return _records[contentHash];
    }
}
