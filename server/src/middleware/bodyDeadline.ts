// A kérés törzsének beérkezési határideje. Az egyidejűségi korlát (concurrency.ts) helye a válasz
// lezárultáig foglalt: egy lassan csepegtetett törzs a kérés teljes időkorlátjáig (3 perc)
// lefoglalhatná, és néhány ilyen kérés mindenki más elől elzárná a végpontot. Ha a törzs a
// határidőig nem érkezik meg, a kapcsolatot bontjuk – a hely felszabadul. (Élesben a teljes
// védelmet a törzset pufferelő fordított proxy adja, L32.)
// Forrás: Node.js dokumentáció – http.IncomingMessage (end, close, destroy),
// https://nodejs.org/api/http.html#class-httpincomingmessage
import type { RequestHandler } from 'express';

export function createBodyDeadline(timeoutMs: number): RequestHandler {
  return (req, _res, next) => {
    const timer = setTimeout(() => {
      req.log?.warn('A kérés törzse nem érkezett meg időben – a kapcsolat bontva');
      req.destroy();
    }, timeoutMs);
    // A futó határidő nem tartja életben a folyamatot (pl. leállításkor)
    timer.unref();
    // A törzs beérkezett és beolvasták (end), vagy a kérés lezárult (close): a határidő már nem kell
    const stop = (): void => {
      clearTimeout(timer);
    };
    req.once('end', stop);
    req.once('close', stop);
    next();
  };
}
