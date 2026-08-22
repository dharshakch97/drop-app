const path = require('path');
const crypto = require('crypto');
const { app } = require('electron');
const { PrismaBetterSqlite3 } = require('@prisma/adapter-better-sqlite3');
const { PrismaClient } = require('@prisma/client');

const dbPath = path.join(app.getPath('userData'), 'drop-app.db');
const adapter = new PrismaBetterSqlite3({ url: `file:${dbPath}` });
const prisma = new PrismaClient({ adapter });

const createEntry = async ({ type = 'snippet', title = '', content, tags = '' }) => {
  const id = crypto.randomUUID();
  const now = Date.now();
  return prisma.entry.create({
    data: {
      id, type, title, content, tags,
      pinned: false, deleted: false, dirty: true,
      createdAt: now, updatedAt: now,
    },
  });
}

const getEntry = async (id) => {
  return prisma.entry.findUnique({ where: { id } });
}

const listEntries = async ({ search = '' } = {}) => {
  const where = {
    deleted: false,
    ...(search.trim() && {
      OR: [
        { title: { contains: search } },
        { content: { contains: search } },
        { tags: { contains: search } },
      ],
    }),
  };

  return prisma.entry.findMany({
    where,
    orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
  });
}

const togglePin = async (id) => {
  const entry = await getEntry(id);
  if (!entry) return null;
  return prisma.entry.update({
    where: { id },
    data: {
      pinned: !entry.pinned,
      dirty: true,
      updatedAt: Date.now()
    },
  });
}

// Soft delete — tombstone instead of removing the row, so deletion syncs.
const deleteEntry = async (id) => {
  await prisma.entry.update({
    where: { id },
    data: {
      deleted: true,
      dirty: true,
      updatedAt: Date.now()
    },
  });
  return true;
}

// --- Sync helpers ---

const getDirtyEntries = async () => {
  return prisma.entry.findMany({ where: { dirty: true } });
}

const markSynced = async (ids) => {
  if (ids.length === 0) return;
  await prisma.entry.updateMany({
    where: { id: { in: ids } },
    data: { dirty: false, syncedAt: Date.now() },
  });
}

const upsertFromServer = async (entry) => {
  const local = await getEntry(entry.id);
  if (local && local.dirty) return; // local unsynced changes take priority

  await prisma.entry.upsert({
    where: { id: entry.id },
    create: {
      id: entry.id,
      type: entry.type,
      title: entry.title,
      content: entry.content,
      tags: entry.tags,
      pinned: !!entry.pinned,
      deleted: !!entry.deleted,
      dirty: false,
      syncedAt: Date.now(),
      createdAt: entry.created_at,
      updatedAt: entry.updated_at,
    },
    update: {
      type: entry.type,
      title: entry.title,
      content: entry.content,
      tags: entry.tags,
      pinned: !!entry.pinned,
      deleted: !!entry.deleted,
      dirty: false,
      syncedAt: Date.now(),
      updatedAt: entry.updated_at,
    },
  });
}

module.exports = {
  createEntry,
  getEntry,
  listEntries,
  togglePin,
  deleteEntry,
  getDirtyEntries,
  markSynced,
  upsertFromServer,
};