const page = document.querySelector(".page--section");
const list = document.getElementById("list");
const status = document.getElementById("status");
const fallbackImage = "../assets/images/lidski-zamak.jpg";

if (!page || !list || !status) {
  throw new Error("Section page elements are missing");
}

const file = page.dataset.file;
let items = [];

fetch(`../data/${file}`)
  .then((response) => {
    if (!response.ok) throw new Error("Fetch failed");
    return response.json();
  })
  .then((data) => {
    items = data.filter((item) => item.id && item.title);
    render(items);
  })
  .catch(() => {
    showStatus(
      "Не ўдалося загрузіць дадзеныя. Паспрабуйце абнавіць старонку.",
      "status--error"
    );
  });

function render(data) {
  list.innerHTML = "";

  if (!data.length) {
    showStatus("Пакуль у гэтым раздзеле няма матэрыялаў.", "status--empty");
    return;
  }

  status.style.display = "none";

  data.forEach((item) => {
    const link = document.createElement("a");
    link.href = `object.html?id=${encodeURIComponent(item.id)}`;
    link.className = "list-item";

    const img = document.createElement("img");
    img.className = "list-item__image";
    img.src = item.image || fallbackImage;
    img.alt = item.title;

    const body = document.createElement("div");
    body.className = "list-item__body";

    const title = document.createElement("h2");
    title.className = "list-item__title";
    title.textContent = item.title;

    body.append(title);
    link.append(img, body);
    list.appendChild(link);
  });
}

function showStatus(message, modifier) {
  status.textContent = message;
  status.className = `status ${modifier}`.trim();
  status.style.display = "block";
}
