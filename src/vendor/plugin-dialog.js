// Copyright 2019-2023 Tauri Programme within The Commons Conservancy
// SPDX-License-Identifier: Apache-2.0
// SPDX-License-Identifier: MIT
// Vendored from @tauri-apps/plugin-dialog (dist-js/index.js), adapted to use
// window.__TAURI__ instead of the @tauri-apps/api/core import, since this
// project has no bundler. Used because window.confirm()/alert() are not
// implemented by Tauri's webview and silently no-op.
//
// Wrapped in an IIFE because top-level global function declarations named
// `open`/`confirm` collide with WebKit's non-configurable window.open/
// window.confirm - declaring them at the top level silently aborts the
// entire script before window.PluginDialog ever gets assigned.
(function () {
const { invoke } = window.__TAURI__.core;

function buttonsToRust(buttons) {
  if (buttons === undefined) {
    return undefined;
  }
  if (typeof buttons === "string") {
    return buttons;
  } else if ("ok" in buttons && "cancel" in buttons) {
    return { OkCancelCustom: [buttons.ok, buttons.cancel] };
  } else if ("yes" in buttons && "no" in buttons && "cancel" in buttons) {
    return {
      YesNoCancelCustom: [buttons.yes, buttons.no, buttons.cancel],
    };
  } else if ("ok" in buttons) {
    return { OkCustom: buttons.ok };
  }
  return undefined;
}

async function open(options = {}) {
  if (typeof options === "object") {
    Object.freeze(options);
  }
  return await invoke("plugin:dialog|open", { options });
}

async function save(options = {}) {
  if (typeof options === "object") {
    Object.freeze(options);
  }
  return await invoke("plugin:dialog|save", { options });
}

async function messageCommand(message, options) {
  return await invoke("plugin:dialog|message", {
    message,
    title: options?.title,
    kind: options?.kind,
    buttons: buttonsToRust(options?.buttons),
  });
}

async function message(message, options) {
  const opts = typeof options === "string" ? { title: options } : options;
  if (opts && !opts.buttons && opts.okLabel) {
    opts.buttons = { ok: opts.okLabel };
  }
  return messageCommand(message, opts);
}

async function ask(message, options) {
  const opts = typeof options === "string" ? { title: options } : options;
  const customButtons = opts?.okLabel || opts?.cancelLabel;
  const okLabel = opts?.okLabel ?? "Yes";
  return (
    (await messageCommand(message, {
      title: opts?.title,
      kind: opts?.kind,
      buttons: customButtons ? { ok: okLabel, cancel: opts.cancelLabel ?? "No" } : "YesNo",
    })) === okLabel
  );
}

async function confirm(message, options) {
  const opts = typeof options === "string" ? { title: options } : options;
  const customButtons = opts?.okLabel || opts?.cancelLabel;
  const okLabel = opts?.okLabel ?? "Ok";
  return (
    (await messageCommand(message, {
      title: opts?.title,
      kind: opts?.kind,
      buttons: customButtons ? { ok: okLabel, cancel: opts.cancelLabel ?? "Cancel" } : "OkCancel",
    })) === okLabel
  );
}

window.PluginDialog = { ask, confirm, message, open, save };
})();
