const { invoke } = window.__TAURI__.core;

// Copyright 2019-2023 Tauri Programme within The Commons Conservancy
// SPDX-License-Identifier: Apache-2.0
// SPDX-License-Identifier: MIT
// Vendored from @tauri-apps/plugin-sql (dist-js/index.js), adapted to use the
// window.__TAURI__ global instead of the @tauri-apps/api/core import, since
// this project has no bundler.
class Database {
  constructor(path) {
    this.path = path;
  }

  static async load(path) {
    const _path = await invoke("plugin:sql|load", {
      db: path,
    });
    return new Database(_path);
  }

  static get(path) {
    return new Database(path);
  }

  async execute(query, bindValues) {
    const [rowsAffected, lastInsertId] = await invoke("plugin:sql|execute", {
      db: this.path,
      query,
      values: bindValues ?? [],
    });
    return {
      lastInsertId,
      rowsAffected,
    };
  }

  async select(query, bindValues) {
    const result = await invoke("plugin:sql|select", {
      db: this.path,
      query,
      values: bindValues ?? [],
    });
    return result;
  }

  async close(db) {
    const success = await invoke("plugin:sql|close", {
      db,
    });
    return success;
  }
}

window.PluginSqlDatabase = Database;
