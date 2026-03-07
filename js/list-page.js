const page = document.querySelector("[data-list-page]");
const list = document.getElementById("list");
const status = document.getElementById("status");
const statusBaseClass = "loading";
const fallbackImage = "../assets/images/lidski_zamak.jpg";

if (!page || !list || !status) {
  throw new Error("List page elements are missing");
}

const file = page.dataset.file;
let items = [];

fetch(`../data/${file}`)
  .then((response) => {
    if (!response.ok) throw new Error("fetch failed");
    return response.json();
  })
  .then((data) => {
    items = data.filter((item) => item.id && item.title);
    render(items);
  })
  .catch(() => {
    showStatus("Не ўдалося загрузіць дадзеныя. Паспрабуйце абнавіць старонку.", "error-state");
  });

function render(data) {
  list.innerHTML = "";

  if (!data.length && !items.length) {
    showStatus("Пакуль у гэтым раздзеле няма матэрыялаў.", "empty-state");
    return;
  }

  status.style.display = "none";

  data.forEach((item) => {
    const link = document.createElement("a");
    link.href = `object.html?id=${encodeURIComponent(item.id)}`;
    link.className = "button";

    const bg = document.createElement("div");
    bg.className = "button-bg";
    bg.style.backgroundImage = `url(${item.image || fallbackImage})`;

    const title = document.createElement("h2");
    title.className = "button-text";
    title.textContent = item.title;

    link.append(bg, title);
    list.appendChild(link);
  });
}

function showStatus(message, className) {
  status.textContent = message;
  status.className = `${statusBaseClass} ${className}`.trim();
  status.style.display = "block";
}