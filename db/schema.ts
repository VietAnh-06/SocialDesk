import {
  sqliteTable,
  text,
  integer,
  uniqueIndex,
  index,
} from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  createdAt: integer('created_at').notNull(),
});
export const sessions = sqliteTable('sessions', {
  tokenHash: text('token_hash').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: integer('expires_at').notNull(),
  oauthState: text('oauth_state'),
  oauthExpires: integer('oauth_expires'),
});
export const attempts = sqliteTable('auth_attempts', {
  key: text('key').primaryKey(),
  count: integer('count').notNull(),
  windowStart: integer('window_start').notNull(),
});
export const connections = sqliteTable(
  'connections',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    kind: text('kind').notNull(),
    remoteId: text('remote_id').notNull(),
    url: text('url').notNull(),
    credential: text('credential'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [uniqueIndex('connection_identity').on(t.userId, t.kind, t.remoteId)],
);
export const posts = sqliteTable('posts', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  message: text('message').notNull(),
  imageUrl: text('image_url'),
  mediaId: text('media_id'),
  version: integer('version').notNull().default(1),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});
export const targets = sqliteTable(
  'targets',
  {
    id: text('id').primaryKey(),
    postId: text('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    connectionId: text('connection_id')
      .notNull()
      .references(() => connections.id),
    status: text('status').notNull().default('draft'),
    remoteId: text('remote_id'),
    remoteUrl: text('remote_url'),
    error: text('error'),
    publishedVersion: integer('published_version'),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [uniqueIndex('post_connection').on(t.postId, t.connectionId)],
);
export const media = sqliteTable('media', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  objectKey: text('object_key').notNull(),
  mime: text('mime').notNull(),
  createdAt: integer('created_at').notNull(),
});
export const activity = sqliteTable(
  'activity',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    message: text('message').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('activity_user').on(t.userId, t.createdAt)],
);
