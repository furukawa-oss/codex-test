const refreshButton = document.querySelector("#refreshButton");
const toast = document.querySelector("#toast");

refreshButton?.addEventListener("click", () => {
  refreshButton.textContent = "更新中…";
  refreshButton.disabled = true;
  window.setTimeout(() => {
    refreshButton.textContent = "更新";
    refreshButton.disabled = false;
    toast.classList.add("show");
    window.setTimeout(() => toast.classList.remove("show"), 2400);
  }, 700);
});

document.querySelectorAll(".nav-item").forEach((item) => {
  item.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach((nav) => nav.classList.remove("active"));
    item.classList.add("active");
  });
});
