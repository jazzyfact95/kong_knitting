import { symbols } from "../js/symbol_list.js";

$("#print").on("click", () => window.print());

$(function () {
  /* ──────────────────────────────────────────────────
     기본 설정
     색상 모드는 회색(#d3d3d3) 칠하기 ↔ 원래 색으로 복원 토글만 지원
     RGB 컬러피커 및 임의 색상 선택 기능은 전부 제거됨
  ──────────────────────────────────────────────────*/

  const img = (slug) => `./svg/${slug}.svg`;
  const GRAY_COLOR = "#d3d3d3"; // 회색 한 가지 고정

  let mode = "symbol", // 초기값: 도안(심볼) 모드
    cur = 0, // 현재 선택된 심볼 인덱스
    zoom = 1,
    drawing = false,
    space = false,
    panning = false;

  const pan = { x: 0, y: 0 };

  const $legend = $("#legend");
  const $grid = $("#grid");

  /* ────────────────────────────────────────────────
     그리드 직렬화 / 역직렬화 (JSON 저장·불러오기)
  ────────────────────────────────────────────────*/
  function gridToJSON() {
    const cols = +$("#cols").val();
    const rows = +$("#rows").val();
    const cells = [];

    $("#grid .cell").each(function () {
      const $c = $(this);
      let data = null;

      // ① 심볼
      const $img = $c.find("img");
      if ($img.length) {
        const slug = $img.attr("src").split("/").pop().replace(".svg", "");
        data = { type: "symbol", slug };
      }
      // ② 색상 (회색)
      else {
        const bg = $c.css("background-color");
        // 기본 surface 색(#fff)라면 빈칸으로 간주
        if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "rgb(255, 255, 255)")
          data = { type: "color", color: bg };
      }
      cells.push(data); // null 허용(빈칸 처리)
    });

    return { cols, rows, cells };
  }

  function jsonToGrid(obj) {
    if (!obj || !obj.cols || !obj.rows) {
      alert("잘못된 JSON 파일입니다.");
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

  /* JSON 내보내기 */
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

  /* JSON 불러오기 */
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
        alert("JSON 파싱 오류: 콘솔을 확인하세요.");
        console.error(err);
      }
    };
    reader.readAsText(file, "utf-8");
  });

  /* ────────────────────────────────────────────────
     UI 렌더링 (레전드, 확대/이동)
  ────────────────────────────────────────────────*/
  function renderLegend() {
    $legend.empty();
    symbols.forEach(([slug, label], i) => {
      $legend.append(
        `<div class='legend-item' data-i='${i}'>[${i + 1}]<img src='${img(
          slug
        )}'/>${label}</div>`
      );
    });
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

  /* 이미지(PNG)로 저장 */
  $("#save-img")
    .off("click")
    .on("click", () => {
      const $vp = $("#viewport");
      html2canvas($vp[0], {
        backgroundColor: "#ffffff",
        scale: 2,
        useCORS: true,
        onclone: (clonedDoc) => {
          const vpClone = clonedDoc.querySelector("#viewport");
          if (vpClone) vpClone.style.transform = "none";
        },
      }).then((canvas) => {
        const a = document.createElement("a");
        a.href = canvas.toDataURL("image/png");
        a.download = "knit_grid.png";
        a.click();
      });
    });

  /* ────────────────────────────────────────────────
     그리드 빌드 + 라벨 (5단위 표시)
  ────────────────────────────────────────────────*/
  function buildGrid(c, r) {
    const STEP = 31; // 셀 30 + gap 1

    $grid.empty().css({
      gridTemplateColumns: `repeat(${c},30px)`,
      gridTemplateRows: `repeat(${r},30px)`,
    });
    for (let i = 0; i < c * r; i++) {
      $grid.append('<div class="cell"></div>');
    }

    // 패닝 초기화
    setPan(0, 0);

    // 라벨 새로 그리기
    $("#viewport .h-label, #viewport .v-label").remove();
    const bottomY = r * STEP;
    const rightX = c * STEP;

    for (let col = 0; col < c; col++) {
      const val = c - col;
      if (val % 5 === 0) {
        $('<div class="h-label">' + val + "</div>")
          .css({ left: col * STEP + 15, top: bottomY + 5 })
          .appendTo("#viewport");
      }
    }
    $('<div class="h-label">0</div>')
      .css({ left: (c - 1) * STEP + 15, top: bottomY + 5 })
      .appendTo("#viewport");

    for (let row = 0; row < r; row++) {
      const val = r - row;
      if (val % 5 === 0) {
        $('<div class="v-label">' + val + "</div>")
          .css({ left: rightX + 10, top: row * STEP + 15 })
          .appendTo("#viewport");
      }
    }
    $('<div class="v-label">0</div>')
      .css({ left: rightX + 5, top: (r - 1) * STEP + 15 })
      .appendTo("#viewport");
  }

  /* ────────────────────────────────────────────────
     "그리기" 동작
     - 심볼 모드: 심볼 배치
     - 색상 모드: 회색 칠하기 ↔ 원상복구 (심볼 제거도 함께)
  ────────────────────────────────────────────────*/
  function paint($cell) {
    if (mode === "symbol") {
      // 배경색 초기화 후 심볼 넣기
      $cell.css("background", "").html(`<img src='${img(symbols[cur][0])}'/>`);
    } else {
      // 색상 모드: 심볼이 있으면 제거한 뒤 배경색 토글
      $cell.find("img").remove();

      const bg = $cell.css("background-color");
      const isGray =
        bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "rgb(255, 255, 255)";

      if (isGray) {
        $cell.css("background", ""); // 원상 복구
      } else {
        $cell.css("background", GRAY_COLOR); // 회색 칠하기
      }
    }
  }

  /* ────────────────────────────────────────────────
     초기 렌더링
  ────────────────────────────────────────────────*/
  $(window).on("load", () => {
    renderLegend();
    buildGrid(20, 20);
  });

  /* 레전드 클릭 */
  $legend.on("click", ".legend-item", function () {
    cur = +$(this).data("i");
    highlight();
  });

  /* 그리드 드로잉 */
  $grid.on("mousedown", function (e) {
    const $cell = $(e.target).closest(".cell");
    if ($cell.length && !space) {
      drawing = true;
      paint($cell);
    }
  });
  $grid.on("mouseover", function (e) {
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

  /* 패닝 (스페이스바 누른 상태에서 드래그) */
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

  /* 버튼 */
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

  /* 키보드 단축키 */
  $(document)
    .on("keydown", (e) => {
      if (e.code === "Space") space = true;

      if (e.key === "F1") {
        e.preventDefault();
        mode = "color";
        $("#mode-label").text("색상모드 (F1)");
      }
      if (e.key === "F2") {
        e.preventDefault();
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
