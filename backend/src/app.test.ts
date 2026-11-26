import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../generated/prisma/client';
import { createApp } from './app';

const db = {
  $queryRaw: vi.fn(),
  $transaction: vi.fn(),
  room: { findMany: vi.fn(), findFirst: vi.fn() },
  user: { findUnique: vi.fn() },
  reservation: {
    count: vi.fn(), create: vi.fn(), findMany: vi.fn(),
    findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn(),
  },
  blockedSlot: { count: vi.fn() },
};

const app = createApp(db as unknown as PrismaClient);

const interval = {
  start: '2026-12-01T10:00:00Z',
  end: '2026-12-01T11:00:00Z'
};

const booking = {
  ...interval,
  userId: 'user-1',
  roomId: 'room-1',
  purpose: 'Meeting'
};

beforeEach(() => {
  vi.resetAllMocks();
  db.room.findFirst.mockResolvedValue({ id: 'room-1' });
  db.user.findUnique.mockResolvedValue({ id: 'user-1' });
  db.reservation.count.mockResolvedValue(0);
  db.blockedSlot.count.mockResolvedValue(0);
  db.$transaction.mockImplementation(
    async (fn: (tx: typeof db) => unknown) => fn(db)
  );
});

describe('RoomFlow API', () => {

  it('vrne pozdravno sporočilo API-ja', async () => {
    expect((await request(app).get('/')).body.message)
      .toBe('RoomFlow API deluje');
  });

  it('vrne uspešno stanje povezave s podatkovno bazo', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.database).toBe('connected');
  });

  it('zazna nedosegljivost podatkovne baze', async () => {
    db.$queryRaw.mockRejectedValue(new Error('offline'));
    expect((await request(app).get('/health')).status).toBe(500);
  });

  it('vrne samo aktivne sobe, razvrščene po imenu', async () => {
    db.room.findMany.mockResolvedValue([{ id: 'room-1', name: 'A' }]);

    const res = await request(app).get('/rooms');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 'room-1', name: 'A' }]);

    expect(db.room.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isActive: true },
        orderBy: { name: 'asc' }
      })
    );
  });

  it('zavrne preverjanje razpoložljivosti brez časovnega intervala', async () => {
    expect(
      (await request(app).get('/rooms/room-1/availability')).status
    ).toBe(400);

    expect(db.room.findFirst).not.toHaveBeenCalled();
  });

  it.each([
    ['neveljaven datum', { start: 'invalid', end: interval.end }],
    ['enak začetni in končni čas', { start: interval.start, end: interval.start }],
    ['obrnjen časovni interval', { start: interval.end, end: interval.start }],
  ])('zavrne preverjanje razpoložljivosti: %s', async (_label, query) => {
    expect(
      (await request(app)
        .get('/rooms/room-1/availability')
        .query(query)).status
    ).toBe(400);
  });

  it('vrne status 404 za neobstoječo ali neaktivno sobo', async () => {
    db.room.findFirst.mockResolvedValue(null);

    expect(
      (await request(app)
        .get('/rooms/missing/availability')
        .query(interval)).status
    ).toBe(404);
  });

  it('vrne razpoložljivost sobe v prostem terminu', async () => {
    const res = await request(app)
      .get('/rooms/room-1/availability')
      .query(interval);

    expect(res.body.available).toBe(true);

    expect(db.reservation.count).toHaveBeenCalledWith({
      where: {
        roomId: 'room-1',
        status: 'CONFIRMED',
        startTime: { lt: new Date(interval.end) },
        endTime: { gt: new Date(interval.start) },
      }
    });
  });

  it('vrne nerazpoložljivost sobe zaradi prekrivajoče se rezervacije', async () => {
    db.reservation.count.mockResolvedValue(1);

    expect(
      (await request(app)
        .get('/rooms/room-1/availability')
        .query(interval)).body.available
    ).toBe(false);
  });

  it('vrne nerazpoložljivost sobe zaradi blokiranega termina', async () => {
    db.blockedSlot.count.mockResolvedValue(1);

    expect(
      (await request(app)
        .get('/rooms/room-1/availability')
        .query(interval)).body.available
    ).toBe(false);
  });

  it('zavrne nepopolno rezervacijo pred dostopom do podatkovne baze', async () => {
    expect(
      (await request(app)
        .post('/reservations')
        .send({ roomId: 'room-1' })).status
    ).toBe(400);

    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('zavrne rezervacijo z neveljavnim časovnim intervalom', async () => {
    expect(
      (await request(app)
        .post('/reservations')
        .send({ ...booking, end: booking.start })).status
    ).toBe(400);
  });

  it('zavrne rezervacijo neobstoječega uporabnika', async () => {
    db.user.findUnique.mockResolvedValue(null);

    expect(
      (await request(app)
        .post('/reservations')
        .send(booking)).status
    ).toBe(404);
  });

  it('ustvari potrjeno rezervacijo z uporabo serializabilne transakcije', async () => {
    db.reservation.create.mockResolvedValue({
      id: 'reservation-1',
      status: 'CONFIRMED'
    });

    const res = await request(app)
      .post('/reservations')
      .send(booking);

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('CONFIRMED');

    expect(db.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      { isolationLevel: 'Serializable' }
    );

    expect(db.reservation.create).toHaveBeenCalledWith({
      data: {
        userId: booking.userId,
        roomId: booking.roomId,
        purpose: booking.purpose,
        startTime: new Date(booking.start),
        endTime: new Date(booking.end),
        status: 'CONFIRMED',
      }
    });
  });

  it('prepreči shranjevanje prekrivajoče se rezervacije', async () => {
    db.reservation.count.mockResolvedValue(1);

    expect(
      (await request(app)
        .post('/reservations')
        .send(booking)).status
    ).toBe(409);

    expect(db.reservation.create).not.toHaveBeenCalled();
  });

  it('prepreči shranjevanje rezervacije v blokiranem terminu', async () => {
    db.blockedSlot.count.mockResolvedValue(1);

    expect(
      (await request(app)
        .post('/reservations')
        .send(booking)).status
    ).toBe(409);

    expect(db.reservation.create).not.toHaveBeenCalled();
  });

  it('vrne status 409 ob konfliktu sočasnih transakcij', async () => {
    db.$transaction.mockRejectedValue({ code: 'P2034' });

    expect(
      (await request(app)
        .post('/reservations')
        .send(booking)).status
    ).toBe(409);
  });

  it('vrne rezervacije izbranega uporabnika', async () => {
    db.reservation.findMany.mockResolvedValue([
      { id: 'reservation-1' }
    ]);

    const res = await request(app)
      .get('/users/user-1/reservations');

    expect(res.body).toEqual([{ id: 'reservation-1' }]);

    expect(db.reservation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1' }
      })
    );
  });

  it('zavrne posodobitev rezervacije brez identifikatorja uporabnika', async () => {
    expect(
      (await request(app)
        .patch('/reservations/reservation-1')
        .send(interval)).status
    ).toBe(400);
  });

  it('zavrne posodobitev rezervacije drugega uporabnika', async () => {
    db.reservation.findFirst.mockResolvedValue(null);

    expect(
      (await request(app)
        .patch('/reservations/reservation-1')
        .send(booking)).status
    ).toBe(404);

    expect(db.reservation.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'reservation-1',
        userId: 'user-1',
        status: 'CONFIRMED'
      }
    });
  });

  it('uspešno posodobi rezervacijo v razpoložljivem terminu', async () => {
    db.reservation.findFirst.mockResolvedValue({
      roomId: 'room-1'
    });

    db.reservation.update.mockResolvedValue({
      id: 'reservation-1',
      purpose: 'Meeting'
    });

    expect(
      (await request(app)
        .patch('/reservations/reservation-1')
        .send(booking)).body.purpose
    ).toBe('Meeting');
  });

  it('zavrne posodobitev rezervacije zaradi prekrivanja z blokiranim terminom', async () => {
    db.reservation.findFirst.mockResolvedValue({
      roomId: 'room-1'
    });

    db.blockedSlot.count.mockResolvedValue(1);

    expect(
      (await request(app)
        .patch('/reservations/reservation-1')
        .send(booking)).status
    ).toBe(409);

    expect(db.reservation.update).not.toHaveBeenCalled();
  });

  it('zahteva identifikator uporabnika za preklic rezervacije', async () => {
    expect(
      (await request(app)
        .patch('/reservations/reservation-1/cancel')
        .send({})).status
    ).toBe(400);
  });

  it('prepreči preklic neobstoječe rezervacije ali rezervacije drugega uporabnika', async () => {
    db.reservation.updateMany.mockResolvedValue({ count: 0 });

    expect(
      (await request(app)
        .patch('/reservations/reservation-1/cancel')
        .send({ userId: 'user-1' })).status
    ).toBe(404);
  });

  it('prekliče samo potrjeno rezervacijo v lasti uporabnika', async () => {
    db.reservation.updateMany.mockResolvedValue({ count: 1 });

    expect(
      (await request(app)
        .patch('/reservations/reservation-1/cancel')
        .send({ userId: 'user-1' })).status
    ).toBe(200);

    expect(db.reservation.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'reservation-1',
        userId: 'user-1',
        status: 'CONFIRMED'
      },
      data: {
        status: 'CANCELLED'
      },
    });
  });

});