// 1. Атрымаць id з URL
const params = new URLSearchParams(window.location.search);
const objectId = params.get("id");

// 2. Загрузіць JSON
fetch("../data/sights.json")
  .then((response) => response.json())
  .then((data) => {
    // 3. Знайсці патрэбны аб’ект
    const object = data.find((item) => item.id === objectId);

    if (!object) return;

    // 4. Уставіць дадзеныя
    document.getElementById("title").textContent = object.title;

    const img = document.getElementById("image");
    img.src = object.image;
    img.alt = object.title;

    document.getElementById("description").innerHTML = object.description;

    const audio = document.createElement("audio");
    audio.controls = true;
    audio.classList.add("obj-audio");

    const source = document.createElement("source");
    source.src = object.audio; // шлях з JSON
    source.type = "audio/mpeg"; // дакладны тып MP3

    audio.appendChild(source);
    document.getElementById("audioContainer").appendChild(audio);
  });
