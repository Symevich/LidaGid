// object.js з лагаваннем для адладкі
const params = new URLSearchParams(window.location.search);
const id = params.get("id");

console.log("URL id:", id);

if (!id) {
  document.body.innerHTML = "<h2>Не перададзены id</h2>";
  throw new Error("No ID in URL");
}

// Загружаем усе JSON
Promise.all([
  fetch("../data/sights.json")
    .then((r) => {
      console.log("Sights JSON status:", r.status);
      return r.json();
    }),
  fetch("../data/enterprises.json")
    .then((r) => {
      console.log("Enterprises JSON status:", r.status);
      return r.json();
    }),
  fetch("../data/people.json")
    .then((r) => {
      console.log("People JSON status:", r.status);
      return r.json();
    }),
])
  .then(([sights, enterprises, people]) => {
    console.log("Sights loaded:", sights.length);
    console.log("Enterprises loaded:", enterprises.length);
    console.log("People loaded:", people.length);

    const allData = [...sights, ...enterprises, ...people];

    const object = allData.find((item) => item.id === id);
    console.log("Found object:", object);

    if (!object) {
      document.body.innerHTML = "<h2>Аб'ект не знойдзены</h2>";
      return;
    }

    renderObject(object);
  })
  .catch((err) => {
    console.error("Fetch error:", err);
    document.body.innerHTML = "<h2>Памылка загрузкі дадзеных</h2>";
  });

function renderObject(object) {
  console.log("Rendering object:", object);

  // Загаловак
  const titleEl = document.getElementById("title");
  if (titleEl && object.title) titleEl.textContent = object.title;

  // Малюнак
  if (object.image) {
    const img = document.getElementById("image");
    if (img) {
      console.log("Setting image src:", object.image);
      img.src = object.image; // без replace
      img.alt = object.title || "";
      img.style.display = "block";
    }
  }

  // Апісанне
  const descEl = document.getElementById("description");
  if (descEl && object.description) {
    console.log("Setting description HTML");
    descEl.innerHTML = object.description;
  }

  // Аўдыё
  if (object.audio) {
    const audioContainer = document.getElementById("audioContainer");
    if (audioContainer) {
      console.log("Adding audio:", object.audio);
      const audio = document.createElement("audio");
      audio.controls = true;
      audio.style.width = "100%";

      const source = document.createElement("source");
      source.src = object.audio; // без replace
      source.type = "audio/mpeg";

      audio.appendChild(source);
      audioContainer.appendChild(audio);
    }
  }
}