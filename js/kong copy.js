import { symbols } from "../js/symbol_list.js";

$("#print").on("click", () => window.print());

$(function () {
  /* --- 기호 데이터 (샘플 10개로 축소) --- */

  const img = (slug) => `./svg/${slug}.svg`;
  const colors = Array(symbols.length).fill("#ffd4e1");
  let mode = "symbol",
    cur = 0,
    zoom = 1,
    drawing = false,
    space = false,
    panning = false;
  const pan = { x: 0, y: 0 };

  const $legend = $("#legend"),
    $grid = $("#grid");

  /* ─ 그리드 → JSON 직렬화 ─ */
  function gridToJSON() {
    const cols = +$("#cols").val();
    const rows = +$("#rows").val();
    const cells = [];

    $("#grid .cell").each(function (i) {
      const $c = $(this);
      let data = null;

      // ① 심볼 모드
      const $img = $c.find("img");
      if ($img.length) {
        const slug = $img.attr("src").split("/").pop().replace(".svg", "");
        data = { type: "symbol", slug };
      }
      // ② 색상 모드
      else {
        const bg = $c.css("background-color");
        // 기본 surface 색(#fff)라면 빈칸으로 간주
        if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "rgb(255, 255, 255)")
          data = { type: "color", color: bg };
      }
      cells.push(data); // null 도 허용(빈칸)
    });

    return { cols, rows, cells };
  }

  /* ─ JSON → 그리드 복원 ─ */
  function jsonToGrid(obj) {
    if (!obj || !obj.cols || !obj.rows) {
      alert("잘못된 JSON");
      return;
    }

    $("#cols").val(obj.cols);
    $("#rows").val(obj.rows);
    buildGrid(obj.cols, obj.rows);

    $("#grid .cell").each(function (i) {
      const data = obj.cells[i];
      if (!data) return;

      if (data.type === "symbol") {
        $(this).html(`<img src="./svg/${data.slug}.svg">`);
      } else if (data.type === "color") {
        $(this).css("background", data.color);
      }
    });
  }

  /* JSON 저장 → 파일 다운로드 */
  $("#export-json").on("click", () => {
    const json = JSON.stringify(gridToJSON());
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "knit_grid.json";
    a.click();
    URL.revokeObjectURL(url);
  });

  /* JSON 불러오기 (파일 선택) */
  $("#import-json").on("click", () => $("#json-file").click());

  $("#json-file").on("change", function () {
    const file = this.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const obj = JSON.parse(e.target.result);
        jsonToGrid(obj);
      } catch (err) {
        alert("JSON 파싱 오류");
        console.error(err);
      }
    };
    reader.readAsText(file, "utf-8");
  });

  /* --- UI 렌더 --- */
  function renderLegend() {
    $legend.empty();
    symbols.forEach(([slug, label], i) =>
      $legend.append(
        `<div class='legend-item' data-i='${i}'>[${i}]<img src='${img(
          slug
        )}'/>${label}</div>`
      )
    );
    highlight();
  }
  function highlight() {
    $(".legend-item").removeClass("selected");
    $(`.legend-item[data-i='${cur}']`).addClass("selected");
  }
  function setZoom(z) {
    zoom = Math.max(0.3, Math.min(3, z));
    document.documentElement.style.setProperty("--zoom", zoom);
    $("#zoom-label").text(Math.round(zoom * 100) + "%");
  }
  function setPan(x, y) {
    pan.x = x;
    pan.y = y;
    document.documentElement.style.setProperty("--pan-x", x + "px");
    document.documentElement.style.setProperty("--pan-y", y + "px");
  }

  $("#save-img")
    .off("click")
    .on("click", () => {
      const $vp = $("#viewport"); // 캡처 대상

      html2canvas($vp[0], {
        backgroundColor: "#ffffff", // 흰 배경
        scale: 2, // 고해상도
        useCORS: true, // 외부 SVG가 있으면 켜두기
        onclone: (clonedDoc) => {
          /* 이 clonedDoc은 html2canvas가 만든 가상 DOM!
             원본은 손대지 않는다 */
          const vpClone = clonedDoc.querySelector("#viewport");
          if (vpClone) vpClone.style.transform = "none"; // 줌/패닝 해제
        },
      })
        .then((canvas) => {
          const a = document.createElement("a");
          a.href = canvas.toDataURL("image/png");
          a.download = "knit_grid.png";
          a.click();
        })
        .catch((err) => console.error(err));
    });

  function buildGrid(c, r) {
    const PAD = 40; // #viewport 패딩(px)과 동일 값
    /* ─ 기존 셀 생성 ─ */
    $grid.empty().css({
      gridTemplateColumns: `repeat(${c},30px)`,
      gridTemplateRows: `repeat(${r},30px)`,
    });
    for (let i = 0; i < c * r; i++) $grid.append('<div class="cell"></div>');
    setPan(0, 0);

    /* ─ 라벨 새로 그리기 ─ */
    $("#viewport .h-label, #viewport .v-label").remove(); // 이전 라벨 삭제

    const step = 31; // 셀 30 + gap 1
    const bottomY = r * step; // ↓ 0 라벨 Y
    const rightX = c * step; // → 0 라벨 X

    /* 가로축 라벨 */
    for (let col = 0; col < c; col++) {
      const val = c - col;
      if (val % 5 === 0) {
        $('<div class="h-label">' + val + "</div>")
          .css({ left: col * step + 15, top: bottomY + 5 })
          .appendTo("#viewport");
      }
    }
    $('<div class="h-label">0</div>')
      .css({ left: (c - 1) * step + 15, top: bottomY + 5 })
      .appendTo("#viewport");

    /* 세로축 라벨 */
    for (let row = 0; row < r; row++) {
      const val = r - row;
      if (val % 5 === 0) {
        $('<div class="v-label">' + val + "</div>")
          .css({ left: rightX + 10, top: row * step + 15 })
          .appendTo("#viewport");
      }
    }
    $('<div class="v-label">0</div>')
      .css({ left: rightX + 5, top: (r - 1) * step + 15 })
      .appendTo("#viewport");
  }

  function paint($cell) {
    if (mode === "symbol") $cell.html(`<img src='${img(symbols[cur][0])}'/>`);
    else $cell.css("background", colors[cur]);
  }

  /* --- 초기화 --- */
  $(window).on("load", function () {
    renderLegend();
    buildGrid(20, 20);
  });
  /* --- 레전드 이벤트 --- */
  $legend.on("click", ".legend-item", function () {
    cur = +$(this).data("i");
    highlight();
    if (mode === "color") {
      $('<input type="color">')
        .css({ opacity: 0, position: "fixed" })
        .appendTo("body")
        .on("input change", (e) => {
          colors[cur] = e.target.value;
        })
        .on("blur", function () {
          $(this).remove();
        })
        .trigger("click");
    }
  });

  /* --- 그리드 그리기 --- */
  $("#grid").on("mousedown", function (e) {
    const $cell = $(e.target).closest(".cell");
    if ($cell.length && !space) {
      drawing = true;
      paint($cell);
    }
  });
  $("#grid").on("mouseover", function (e) {
    if (drawing && !space) {
      const $cell = $(e.target).closest(".cell");
      if ($cell.length) paint($cell);
    }
  });
  $(document).on("mouseup", () => {
    drawing = false;
    panning = false;
    $("body").removeClass("panning");
  });

  /* --- 패닝 --- */
  $("#workspace").on("mousedown", function (e) {
    if (space) {
      panning = true;
      $("body").addClass("panning");
      pan.sx = e.clientX - pan.x;
      pan.sy = e.clientY - pan.y;
    }
  });
  $("#workspace").on("mousemove", function (e) {
    if (panning) {
      setPan(e.clientX - pan.sx, e.clientY - pan.sy);
    }
  });

  /* --- 버튼 --- */
  $("#generate").on("click", () =>
    buildGrid(+$("#cols").val(), +$("#rows").val())
  );
  $("#clear").on("click", () => {
    $grid.find(".cell").empty().css("background", "");
  });
  $("#zoom-in").on("click", () => setZoom(zoom + 0.1));
  $("#zoom-out").on("click", () => setZoom(zoom - 0.1));
  $("#mode-toggle").on("click", () => {
    mode = mode === "symbol" ? "color" : "symbol";
    $("#mode-label").text(
      mode === "symbol" ? "도안모드 (F2)" : "색상모드 (F1)"
    );
  });

  /* --- 키보드 --- */
  $(document)
    .on("keydown", (e) => {
      if (e.code === "Space") space = true;
      if (e.key === "F1") {
        mode = "color";
        $("#mode-label").text("색상모드 (F1)");
      }
      if (e.key === "F2") {
        mode = "symbol";
        $("#mode-label").text("도안모드 (F2)");
      }
      if (/^[1-9]$/.test(e.key)) {
        const i = +e.key - 1;
        if (i < symbols.length) {
          cur = i;
          highlight();
        }
      }
      if (e.key === "+" || e.key === "=") setZoom(zoom + 0.1);
      if (e.key === "-" || e.key === "_") setZoom(zoom - 0.1);
    })
    .on("keyup", (e) => {
      if (e.code === "Space") space = false;
    });
});
