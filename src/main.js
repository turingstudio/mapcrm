const { invoke } = window.__TAURI__.core;

async function greet() {
  // Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
  const name = $("#greet-input").val();
  const message = await invoke("greet", { name });
  $("#greet-msg").text(message);
}

$(function () {
  $("#greet-form").on("submit", function (e) {
    e.preventDefault();
    greet();
  });
});
