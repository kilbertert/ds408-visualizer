const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const visualCanvas = $("#visualCanvas");
const codeBlock = $("#codeBlock");
const algoTitle = $("#algoTitle");
const algoMeta = $("#algoMeta");
const stepDesc = $("#stepDesc");
const resultText = $("#resultText");
const stepCounter = $("#stepCounter");
const examTips = $("#examTips");
const lineHint = $("#lineHint");
const speedRange = $("#speedRange");
const mainGrid = $("#mainGrid");
const paneResizer = $("#paneResizer");
const paneResizeValue = $("#paneResizeValue");

const PANE_RATIO_STORAGE_KEY = "ds408.visualPaneRatio";
const DEFAULT_VISUAL_PANE_RATIO = 0.58;
const MIN_VISUAL_PANE_WIDTH = 360;
const MIN_CODE_PANE_WIDTH = 260;
let visualPaneRatio = DEFAULT_VISUAL_PANE_RATIO;
let isPaneResizing = false;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getPaneSizingBounds() {
  const gridWidth = mainGrid?.getBoundingClientRect().width || 0;
  const splitterWidth = paneResizer?.getBoundingClientRect().width || 22;
  const availableWidth = Math.max(0, gridWidth - splitterWidth);
  const adaptiveVisualMin = Math.min(MIN_VISUAL_PANE_WIDTH, Math.max(260, availableWidth * 0.45));
  const adaptiveCodeMin = Math.min(MIN_CODE_PANE_WIDTH, Math.max(220, availableWidth * 0.28));
  return { gridWidth, splitterWidth, availableWidth, adaptiveVisualMin, adaptiveCodeMin };
}

function applyVisualPaneRatio(ratio, persist = false) {
  if (!mainGrid || !paneResizer || window.matchMedia("(max-width: 1050px)").matches) return;
  const { availableWidth, adaptiveVisualMin, adaptiveCodeMin } = getPaneSizingBounds();
  if (availableWidth <= 0) return;

  const minRatio = adaptiveVisualMin / availableWidth;
  const maxRatio = Math.max(minRatio, (availableWidth - adaptiveCodeMin) / availableWidth);
  visualPaneRatio = clamp(Number(ratio) || DEFAULT_VISUAL_PANE_RATIO, minRatio, maxRatio);
  const visualWidth = Math.round(availableWidth * visualPaneRatio);
  const percent = Math.round(visualPaneRatio * 100);

  mainGrid.style.setProperty("--visual-pane-width", `${visualWidth}px`);
  paneResizer.setAttribute("aria-valuenow", String(percent));
  if (paneResizeValue) paneResizeValue.textContent = `${percent}%`;
  if (persist) localStorage.setItem(PANE_RATIO_STORAGE_KEY, String(visualPaneRatio));
}

function resetPaneRatio() {
  localStorage.removeItem(PANE_RATIO_STORAGE_KEY);
  applyVisualPaneRatio(DEFAULT_VISUAL_PANE_RATIO, false);
}

function setupPaneResizer() {
  if (!mainGrid || !paneResizer) return;

  const storedRatio = Number(localStorage.getItem(PANE_RATIO_STORAGE_KEY));
  visualPaneRatio = Number.isFinite(storedRatio) && storedRatio > 0 ? storedRatio : DEFAULT_VISUAL_PANE_RATIO;
  applyVisualPaneRatio(visualPaneRatio);

  paneResizer.addEventListener("pointerdown", (event) => {
    if (window.matchMedia("(max-width: 1050px)").matches) return;
    isPaneResizing = true;
    paneResizer.classList.add("dragging");
    document.body.classList.add("pane-resizing");
    paneResizer.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  });

  window.addEventListener("pointermove", (event) => {
    if (!isPaneResizing) return;
    const gridRect = mainGrid.getBoundingClientRect();
    const { splitterWidth, availableWidth } = getPaneSizingBounds();
    const pointerOffset = event.clientX - gridRect.left - splitterWidth / 2;
    applyVisualPaneRatio(pointerOffset / availableWidth);
  });

  function finishPaneResize() {
    if (!isPaneResizing) return;
    isPaneResizing = false;
    paneResizer.classList.remove("dragging");
    document.body.classList.remove("pane-resizing");
    localStorage.setItem(PANE_RATIO_STORAGE_KEY, String(visualPaneRatio));
  }

  window.addEventListener("pointerup", finishPaneResize);
  window.addEventListener("pointercancel", finishPaneResize);

  paneResizer.addEventListener("dblclick", resetPaneRatio);
  paneResizer.addEventListener("keydown", (event) => {
    const step = event.shiftKey ? 0.05 : 0.02;
    if (event.key === "ArrowLeft") applyVisualPaneRatio(visualPaneRatio - step, true);
    else if (event.key === "ArrowRight") applyVisualPaneRatio(visualPaneRatio + step, true);
    else if (event.key === "Home") applyVisualPaneRatio(0.30, true);
    else if (event.key === "End") applyVisualPaneRatio(0.80, true);
    else if (event.key === "Enter" || event.key === " ") resetPaneRatio();
    else return;
    event.preventDefault();
    event.stopPropagation();
  });

  let resizeFrame = null;
  window.addEventListener("resize", () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => applyVisualPaneRatio(visualPaneRatio));
  });
}

let currentDemo = null;
let currentSteps = [];
let currentStepIndex = 0;
let timer = null;

function clone(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  if (value === Infinity || value === -Infinity || typeof value !== "object" || value === null) return value;
  if (Array.isArray(value)) return value.map(clone);
  const out = {};
  for (const [k, v] of Object.entries(value)) out[k] = clone(v);
  return out;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function fmtArray(arr) {
  return `[${arr.join(", ")}]`;
}

function baseArrayState(arr, extra = {}) {
  return { kind: "array", arr: clone(arr), ...extra };
}

function addStep(steps, line, desc, state, result = "") {
  steps.push({ line: Array.isArray(line) ? line : [line], desc, state: clone(state), result });
}

function renderCode(lines, activeLines = []) {
  const active = new Set(activeLines);
  codeBlock.innerHTML = lines.map((line, idx) => {
    const cls = active.has(idx) ? "code-line active" : "code-line";
    return `<div class="${cls}" data-line="${idx}"><span class="num">${idx + 1}</span><span>${escapeHtml(line)}</span></div>`;
  }).join("");
  const activeEl = codeBlock.querySelector(".code-line.active");
  if (activeEl) activeEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function renderTips(tips) {
  examTips.innerHTML = tips.map(t => `<li>${escapeHtml(t)}</li>`).join("");
}

function setPlaying(isPlaying) {
  $("#playBtn").textContent = isPlaying ? "暂停" : "自动播放";
}

function stopTimer() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  setPlaying(false);
}

function renderStep() {
  if (!currentDemo || currentSteps.length === 0) return;
  const step = currentSteps[currentStepIndex];
  renderCode(currentDemo.code, step.line);
  renderVisual(step.state);
  stepDesc.textContent = step.desc;
  resultText.textContent = step.result || "—";
  stepCounter.textContent = `${currentStepIndex + 1} / ${currentSteps.length}`;
  lineHint.textContent = `当前高亮：第 ${step.line.map(x => x + 1).join("、")} 行`;
}

function loadDemo(id) {
  stopTimer();
  const demo = DEMO_LIBRARY[id];
  if (!demo) return;
  currentDemo = demo;
  currentSteps = demo.buildSteps();
  currentStepIndex = 0;
  algoTitle.textContent = demo.title;
  algoMeta.textContent = demo.category;
  renderTips(demo.examTips || []);
  $$(".algo-btn").forEach(btn => btn.classList.toggle("active", btn.dataset.id === id));
  renderStep();
}

function nextStep() {
  if (!currentDemo) return;
  if (currentStepIndex < currentSteps.length - 1) {
    currentStepIndex += 1;
    renderStep();
  } else {
    stopTimer();
  }
}

function prevStep() {
  if (!currentDemo) return;
  stopTimer();
  currentStepIndex = Math.max(0, currentStepIndex - 1);
  renderStep();
}

function resetDemo() {
  if (!currentDemo) return;
  stopTimer();
  currentStepIndex = 0;
  renderStep();
}

function togglePlay() {
  if (!currentDemo) return;
  if (timer) {
    stopTimer();
    return;
  }
  setPlaying(true);
  timer = setInterval(() => {
    if (currentStepIndex >= currentSteps.length - 1) {
      stopTimer();
    } else {
      nextStep();
    }
  }, Number(speedRange.value));
}

function renderVisual(state) {
  visualCanvas.className = "visual-canvas";
  if (state.kind === "array") return renderArray(state);
  if (state.kind === "tree") return renderTree(state);
  if (state.kind === "graph") return renderGraph(state);
  if (state.kind === "linear") return renderLinear(state);
  if (state.kind === "custom") return renderCustom(state);
  visualCanvas.innerHTML = `<div class="empty-state">暂无可视化状态</div>`;
}

function renderCustom(state) {
  visualCanvas.className = `visual-canvas ${state.className || ""}`.trim();
  visualCanvas.innerHTML = state.html || `<div class="empty-state">暂无可视化状态</div>`;
}

function renderArray(state) {
  const maxVal = Math.max(...state.arr, 1);
  const compare = new Set(state.compare || []);
  const swap = new Set(state.swap || []);
  const sorted = new Set(state.sorted || []);
  const pivot = state.pivot;
  const active = new Set(state.active || []);
  const markers = state.markers || [];
  const badges = markers.map(m => `<span class="pointer-badge">${escapeHtml(m)}</span>`).join("");
  const bars = state.arr.map((value, idx) => {
    const classes = ["bar"];
    if (compare.has(idx)) classes.push("compare");
    if (swap.has(idx)) classes.push("swap");
    if (sorted.has(idx)) classes.push("sorted");
    if (pivot === idx) classes.push("pivot");
    if (active.has(idx)) classes.push("active");
    const height = 55 + value / maxVal * 250;
    return `<div class="bar-col"><div class="${classes.join(" ")}" style="height:${height}px">${value}</div><div class="bar-index">A[${idx}]</div></div>`;
  }).join("");
  visualCanvas.innerHTML = `<div class="pointer-row">${badges}</div><div class="bars-wrap">${bars}</div>`;
}

const TREE_BASE_NODES = [
  { id: "50", label: "50", x: 400, y: 55 },
  { id: "30", label: "30", x: 240, y: 140 },
  { id: "70", label: "70", x: 560, y: 140 },
  { id: "20", label: "20", x: 145, y: 240 },
  { id: "40", label: "40", x: 335, y: 240 },
  { id: "60", label: "60", x: 495, y: 240 },
  { id: "80", label: "80", x: 655, y: 240 },
];
const TREE_BASE_EDGES = [
  ["50", "30"], ["50", "70"], ["30", "20"], ["30", "40"], ["70", "60"], ["70", "80"]
];
const TREE_WITH_65_NODES = [...TREE_BASE_NODES, { id: "65", label: "65", x: 545, y: 335 }];
const TREE_WITH_65_EDGES = [...TREE_BASE_EDGES, ["60", "65"]];

function renderTree(state) {
  const nodes = state.nodes || TREE_BASE_NODES;
  const edges = state.edges || TREE_BASE_EDGES;
  const nodeMap = Object.fromEntries(nodes.map(n => [n.id, n]));
  const visited = new Set(state.visited || []);
  const current = new Set(state.current || []);
  const target = new Set(state.target || []);
  const insert = new Set(state.insert || []);
  const activeEdges = new Set((state.activeEdges || []).map(e => e.join("->")));
  const edgeEls = edges.map(([a, b]) => {
    const from = nodeMap[a], to = nodeMap[b];
    const cls = activeEdges.has(`${a}->${b}`) ? "edge active" : "edge";
    return `<line class="${cls}" x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" />`;
  }).join("");
  const nodeEls = nodes.map(n => {
    const cls = ["node"];
    if (visited.has(n.id)) cls.push("visited");
    if (current.has(n.id)) cls.push("current");
    if (target.has(n.id)) cls.push("target found");
    if (insert.has(n.id)) cls.push("insert");
    return `<g class="${cls.join(" ")}" transform="translate(${n.x}, ${n.y})"><circle r="24"></circle><text y="1">${escapeHtml(n.label)}</text></g>`;
  }).join("");
  visualCanvas.innerHTML = `<svg class="svg-stage" viewBox="0 0 800 400">${edgeEls}${nodeEls}</svg><div class="graph-note">${escapeHtml(state.note || "绿色表示已访问，橙色表示当前代码正在处理的结点。")}</div>`;
}

const GRAPH_NODES = [
  { id: "A", label: "A", x: 120, y: 85 },
  { id: "B", label: "B", x: 305, y: 70 },
  { id: "C", label: "C", x: 310, y: 190 },
  { id: "D", label: "D", x: 500, y: 85 },
  { id: "E", label: "E", x: 510, y: 230 },
  { id: "F", label: "F", x: 685, y: 150 },
];
const GRAPH_EDGES = [
  { from: "A", to: "B", w: 2 }, { from: "A", to: "C", w: 5 },
  { from: "B", to: "D", w: 4 }, { from: "B", to: "E", w: 6 },
  { from: "C", to: "E", w: 2 }, { from: "D", to: "F", w: 3 },
  { from: "E", to: "F", w: 1 }, { from: "C", to: "B", w: 1 },
];

const DAG_NODES = [
  { id: "A", label: "A", x: 110, y: 105 },
  { id: "B", label: "B", x: 285, y: 55 },
  { id: "C", label: "C", x: 285, y: 195 },
  { id: "D", label: "D", x: 480, y: 80 },
  { id: "E", label: "E", x: 480, y: 225 },
  { id: "F", label: "F", x: 665, y: 145 },
];
const DAG_EDGES = [
  { from: "A", to: "B" }, { from: "A", to: "C" }, { from: "B", to: "D" },
  { from: "C", to: "D" }, { from: "C", to: "E" }, { from: "D", to: "F" }, { from: "E", to: "F" },
];

function renderGraph(state) {
  const nodes = state.nodes || GRAPH_NODES;
  const edges = state.edges || GRAPH_EDGES;
  const nodeMap = Object.fromEntries(nodes.map(n => [n.id, n]));
  const visited = new Set(state.visited || []);
  const current = new Set(state.current || []);
  const target = new Set(state.target || []);
  const activeEdges = new Set((state.activeEdges || []).map(e => `${e.from}->${e.to}`));
  const pathEdges = new Set((state.pathEdges || []).map(e => `${e.from}->${e.to}`));
  const edgeEls = edges.map(e => {
    const from = nodeMap[e.from], to = nodeMap[e.to];
    const cls = ["edge"];
    if (activeEdges.has(`${e.from}->${e.to}`)) cls.push("active");
    if (pathEdges.has(`${e.from}->${e.to}`)) cls.push("path");
    const lx = (from.x + to.x) / 2, ly = (from.y + to.y) / 2 - 8;
    const label = e.w ? `<text class="edge-label" x="${lx}" y="${ly}">${e.w}</text>` : "";
    return `<line class="${cls.join(" ")}" x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" />${label}`;
  }).join("");
  const nodeEls = nodes.map(n => {
    const cls = ["node"];
    if (visited.has(n.id)) cls.push("visited");
    if (current.has(n.id)) cls.push("current");
    if (target.has(n.id)) cls.push("target found");
    return `<g class="${cls.join(" ")}" transform="translate(${n.x}, ${n.y})"><circle r="25"></circle><text>${escapeHtml(n.label)}</text></g>`;
  }).join("");
  const aux = [];
  if (state.queue) aux.push(`队列 Q：${state.queue.join(" → ") || "空"}`);
  if (state.stack) aux.push(`递归/栈：${state.stack.join(" → ") || "空"}`);
  if (state.indegree) aux.push(`入度：${Object.entries(state.indegree).map(([k, v]) => `${k}:${v}`).join("，")}`);
  if (state.dist) aux.push(`dist：${Object.entries(state.dist).map(([k, v]) => `${k}:${v === Infinity ? "∞" : v}`).join("，")}`);
  if (state.output) aux.push(`输出：${state.output.join(" → ") || "空"}`);
  const note = aux.length ? aux.join("；") : (state.note || "绿色表示已访问，橙色表示当前结点。边上的数字是权值。");
  visualCanvas.innerHTML = `<svg class="svg-stage" viewBox="0 0 800 400">${edgeEls}${nodeEls}</svg><div class="graph-note">${escapeHtml(note)}</div>`;
}

function renderLinear(state) {
  if (state.structure === "stack") {
    const items = (state.items || []).map((x, i) => `<div class="stack-item ${state.active === i ? "active" : ""}">${escapeHtml(x)}</div>`).join("");
    visualCanvas.innerHTML = `<div class="linear-wrap"><div class="stack-box"><div class="stack-top">top 指向栈顶</div><div class="stack-items">${items}</div></div></div>`;
    return;
  }
  if (state.structure === "queue") {
    const items = (state.items || []).map((x, i) => `<div class="queue-item ${state.active === i ? "active" : ""}">${escapeHtml(x)}</div>`).join("");
    visualCanvas.innerHTML = `<div class="linear-wrap"><div class="queue-box"><div class="queue-labels"><span>front 队头</span><span>rear 队尾</span></div><div class="queue-items">${items || "<span class='empty-state'>空队列</span>"}</div></div></div>`;
    return;
  }
  const nodes = state.items || [];
  const html = nodes.map((x, i) => {
    const cls = ["list-node"];
    if (state.active === i) cls.push("active");
    if (state.newIndex === i) cls.push("new");
    const arrow = i < nodes.length - 1 ? `<span class="arrow">→</span>` : `<span class="arrow">∅</span>`;
    return `<div class="list-node-wrap"><div class="${cls.join(" ")}">${escapeHtml(x)}</div></div>${arrow}`;
  }).join("");
  visualCanvas.innerHTML = `<div class="linear-wrap"><div class="list-box"><div class="list-items"><span class="arrow">head →</span>${html}</div></div></div>`;
}

function sortingTips(extra = []) {
  return [
    "408 常考：稳定性、时间复杂度、空间复杂度、最好/最坏情况。",
    "注意代码中的比较次数、交换次数，以及循环边界。",
    ...extra,
  ];
}

function buildBubbleSteps() {
  const steps = [];
  const arr = [5, 2, 8, 4, 1, 7];
  const n = arr.length;
  addStep(steps, 0, "初始化待排序序列，冒泡排序每一趟会把当前最大元素交换到右端。", baseArrayState(arr), `初始序列：${fmtArray(arr)}`);
  for (let i = 0; i < n - 1; i++) {
    addStep(steps, 1, `外层第 ${i + 1} 趟，右侧已有 ${i} 个元素有序。`, baseArrayState(arr, { sorted: Array.from({ length: i }, (_, k) => n - 1 - k), markers: [`i=${i}`] }), `当前序列：${fmtArray(arr)}`);
    for (let j = 0; j < n - 1 - i; j++) {
      addStep(steps, 2, `内层循环 j=${j}，准备比较 A[${j}] 和 A[${j + 1}]。`, baseArrayState(arr, { compare: [j, j + 1], sorted: Array.from({ length: i }, (_, k) => n - 1 - k), markers: [`i=${i}`, `j=${j}`] }), `比较 ${arr[j]} 和 ${arr[j + 1]}`);
      addStep(steps, 3, arr[j] > arr[j + 1] ? `${arr[j]} > ${arr[j + 1]}，条件成立，需要交换。` : `${arr[j]} <= ${arr[j + 1]}，条件不成立，不交换。`, baseArrayState(arr, { compare: [j, j + 1], sorted: Array.from({ length: i }, (_, k) => n - 1 - k), markers: [`if A[j] > A[j+1]`] }), "判断相邻两个元素是否逆序");
      if (arr[j] > arr[j + 1]) {
        addStep(steps, 4, `执行 swap(A[${j}], A[${j + 1}])，较大的元素向右移动。`, baseArrayState(arr, { swap: [j, j + 1], sorted: Array.from({ length: i }, (_, k) => n - 1 - k), markers: [`交换 ${arr[j]} 与 ${arr[j + 1]}`] }), "交换前");
        [arr[j], arr[j + 1]] = [arr[j + 1], arr[j]];
        addStep(steps, 4, "交换完成，继续向右比较。", baseArrayState(arr, { compare: [j, j + 1], sorted: Array.from({ length: i }, (_, k) => n - 1 - k), markers: [`交换后`] }), `当前序列：${fmtArray(arr)}`);
      }
    }
    addStep(steps, 1, `第 ${i + 1} 趟结束，A[${n - 1 - i}] 已经确定为当前最大值。`, baseArrayState(arr, { sorted: Array.from({ length: i + 1 }, (_, k) => n - 1 - k), markers: [`本趟结束`] }), `当前序列：${fmtArray(arr)}`);
  }
  addStep(steps, 6, "排序完成，所有元素从小到大排列。", baseArrayState(arr, { sorted: [0, 1, 2, 3, 4, 5] }), `最终序列：${fmtArray(arr)}`);
  return steps;
}

function buildSelectionSteps() {
  const steps = [];
  const arr = [5, 2, 8, 4, 1, 7];
  const n = arr.length;
  addStep(steps, 0, "选择排序每一趟从无序区选择最小元素，放到无序区开头。", baseArrayState(arr), `初始序列：${fmtArray(arr)}`);
  for (let i = 0; i < n - 1; i++) {
    let min = i;
    addStep(steps, 1, `第 ${i + 1} 趟，先假设 A[${i}] 是无序区最小值。`, baseArrayState(arr, { active: [i], sorted: [...Array(i).keys()], markers: [`i=${i}`, `min=${min}`] }), `min 指向 ${arr[min]}`);
    addStep(steps, 2, `min = i，即当前最小位置为 ${min}。`, baseArrayState(arr, { active: [min], sorted: [...Array(i).keys()], markers: [`min=${min}`] }), "记录最小元素下标");
    for (let j = i + 1; j < n; j++) {
      addStep(steps, 3, `扫描无序区，j=${j}，比较 A[${j}] 与当前最小值 A[${min}]。`, baseArrayState(arr, { compare: [j, min], sorted: [...Array(i).keys()], markers: [`j=${j}`, `min=${min}`] }), `${arr[j]} 和 ${arr[min]} 比较`);
      addStep(steps, 4, arr[j] < arr[min] ? `${arr[j]} < ${arr[min]}，发现新的最小值。` : `${arr[j]} >= ${arr[min]}，min 不变。`, baseArrayState(arr, { compare: [j, min], sorted: [...Array(i).keys()], markers: [`判断 A[j] < A[min]`] }), "判断是否更新 min");
      if (arr[j] < arr[min]) {
        min = j;
        addStep(steps, 5, `更新 min = ${min}。`, baseArrayState(arr, { active: [min], sorted: [...Array(i).keys()], markers: [`min=${min}`] }), `当前最小值：${arr[min]}`);
      }
    }
    addStep(steps, 7, `一趟扫描结束，把最小值 A[${min}] 与 A[${i}] 交换。`, baseArrayState(arr, { swap: [i, min], sorted: [...Array(i).keys()], markers: [`swap A[${i}], A[${min}]`] }), "交换前");
    [arr[i], arr[min]] = [arr[min], arr[i]];
    addStep(steps, 7, `交换后，A[${i}] 进入有序区。`, baseArrayState(arr, { sorted: [...Array(i + 1).keys()], markers: [`有序区扩大`] }), `当前序列：${fmtArray(arr)}`);
  }
  addStep(steps, 9, "排序完成。选择排序不稳定，关键在于选择最小值后的一次交换可能破坏相同元素相对次序。", baseArrayState(arr, { sorted: [0, 1, 2, 3, 4, 5] }), `最终序列：${fmtArray(arr)}`);
  return steps;
}

function buildInsertionSteps() {
  const steps = [];
  const arr = [5, 2, 8, 4, 1, 7];
  const n = arr.length;
  addStep(steps, 0, "插入排序把前面部分看成有序区，每次把 A[i] 插入到合适位置。", baseArrayState(arr, { sorted: [0] }), `初始有序区：[${arr[0]}]`);
  for (let i = 1; i < n; i++) {
    const key = arr[i];
    let j = i - 1;
    addStep(steps, 1, `取 A[${i}] = ${key}，准备插入到前面的有序区。`, baseArrayState(arr, { active: [i], sorted: [...Array(i).keys()], markers: [`i=${i}`, `key=${key}`] }), "把 A[i] 暂存为 key");
    addStep(steps, 2, `j = ${j}，从有序区最右端开始向左比较。`, baseArrayState(arr, { active: [j, i], sorted: [...Array(i).keys()], markers: [`j=${j}`] }), "从右向左找插入位置");
    while (j >= 0 && arr[j] > key) {
      addStep(steps, 3, `A[${j}] = ${arr[j]} > key = ${key}，需要把 A[${j}] 后移一位。`, baseArrayState(arr, { compare: [j], active: [j + 1], markers: [`key=${key}`, `j=${j}`] }), "while 条件成立");
      arr[j + 1] = arr[j];
      addStep(steps, 4, `A[${j + 1}] = A[${j}]，元素 ${arr[j]} 后移。`, baseArrayState(arr, { active: [j + 1], markers: [`后移`] }), `当前序列：${fmtArray(arr)}`);
      j--;
      addStep(steps, 5, `j--，继续向左寻找插入位置。`, baseArrayState(arr, { active: j >= 0 ? [j] : [], markers: [`j=${j}`] }), "指针左移");
    }
    addStep(steps, 3, j >= 0 ? `A[${j}] = ${arr[j]} <= key = ${key}，找到插入位置 j+1。` : `j < 0，说明 key 应插入到最左端。`, baseArrayState(arr, { active: j >= 0 ? [j] : [], markers: [`插入位置=${j + 1}`] }), "while 条件不成立");
    arr[j + 1] = key;
    addStep(steps, 7, `把 key = ${key} 放入 A[${j + 1}]。`, baseArrayState(arr, { active: [j + 1], sorted: [...Array(i + 1).keys()], markers: [`插入完成`] }), `当前序列：${fmtArray(arr)}`);
  }
  addStep(steps, 9, "排序完成。直接插入排序稳定，适合基本有序的序列。", baseArrayState(arr, { sorted: [0, 1, 2, 3, 4, 5] }), `最终序列：${fmtArray(arr)}`);
  return steps;
}

function buildQuickSteps() {
  const steps = [];
  const arr = [5, 2, 8, 4, 1, 7];
  addStep(steps, 0, "快速排序使用分治思想：选 pivot，一趟划分后 pivot 左边不大于它，右边不小于它。", baseArrayState(arr), `初始序列：${fmtArray(arr)}`);
  function partition(low, high) {
    const pivotValue = arr[high];
    let i = low - 1;
    addStep(steps, 4, `partition(${low}, ${high})，选 A[${high}] = ${pivotValue} 为枢轴 pivot。`, baseArrayState(arr, { pivot: high, active: [low, high], markers: [`low=${low}`, `high=${high}`, `pivot=${pivotValue}`] }), "选取枢轴");
    addStep(steps, 5, `i = low - 1 = ${i}，i 表示“小于等于 pivot 区”的右边界。`, baseArrayState(arr, { pivot: high, markers: [`i=${i}`] }), "初始化 i");
    for (let j = low; j < high; j++) {
      addStep(steps, 6, `j=${j}，扫描当前元素 A[${j}] = ${arr[j]}。`, baseArrayState(arr, { pivot: high, compare: [j, high], markers: [`i=${i}`, `j=${j}`] }), `比较 ${arr[j]} 和 pivot ${pivotValue}`);
      addStep(steps, 7, arr[j] <= pivotValue ? `A[${j}] <= pivot，应该放到左侧区域。` : `A[${j}] > pivot，留在右侧区域。`, baseArrayState(arr, { pivot: high, compare: [j, high], markers: [`判断 A[j] <= pivot`] }), "判断是否交换到左区");
      if (arr[j] <= pivotValue) {
        i++;
        addStep(steps, 8, `i++，左侧区域扩大到 i=${i}。`, baseArrayState(arr, { pivot: high, active: [i, j], markers: [`i=${i}`] }), "扩大左区");
        addStep(steps, 9, `交换 A[${i}] 和 A[${j}]，把较小元素放入左区。`, baseArrayState(arr, { pivot: high, swap: [i, j], markers: [`swap`] }), "交换前");
        [arr[i], arr[j]] = [arr[j], arr[i]];
        addStep(steps, 9, "交换完成。", baseArrayState(arr, { pivot: high, active: [i, j], markers: [`交换后`] }), `当前序列：${fmtArray(arr)}`);
      }
    }
    addStep(steps, 11, `扫描结束，交换 A[${i + 1}] 和 pivot A[${high}]，把 pivot 放到最终位置。`, baseArrayState(arr, { pivot: high, swap: [i + 1, high], markers: [`pivot 归位`] }), "交换前");
    [arr[i + 1], arr[high]] = [arr[high], arr[i + 1]];
    addStep(steps, 11, `pivot 归位到下标 ${i + 1}。`, baseArrayState(arr, { pivot: i + 1, sorted: [i + 1], markers: [`p=${i + 1}`] }), `当前序列：${fmtArray(arr)}`);
    return i + 1;
  }
  function quick(low, high) {
    addStep(steps, 1, `QuickSort(A, ${low}, ${high})，判断区间是否至少有两个元素。`, baseArrayState(arr, { active: [low, high].filter(i => i >= 0 && i < arr.length), markers: [`递归区间 [${low}, ${high}]`] }), "递归入口");
    if (low < high) {
      addStep(steps, 2, `low < high，继续划分。`, baseArrayState(arr, { active: [low, high], markers: [`需要划分`] }), "条件成立");
      const p = partition(low, high);
      addStep(steps, 12, `递归排序 pivot 左侧区间 [${low}, ${p - 1}]。`, baseArrayState(arr, { pivot: p, markers: [`左递归`] }), "处理左半区");
      quick(low, p - 1);
      addStep(steps, 13, `递归排序 pivot 右侧区间 [${p + 1}, ${high}]。`, baseArrayState(arr, { pivot: p, markers: [`右递归`] }), "处理右半区");
      quick(p + 1, high);
    } else {
      addStep(steps, 2, `区间 [${low}, ${high}] 不需要再排序。`, baseArrayState(arr, { markers: [`递归出口`] }), "递归返回");
    }
  }
  quick(0, arr.length - 1);
  addStep(steps, 15, "快速排序完成。平均时间复杂度 O(nlogn)，最坏 O(n²)。", baseArrayState(arr, { sorted: [0, 1, 2, 3, 4, 5] }), `最终序列：${fmtArray(arr)}`);
  return steps;
}

function buildMergeSteps() {
  const steps = [];
  const arr = [5, 2, 8, 4, 1, 7];
  addStep(steps, 0, "归并排序也是分治：先递归分成小区间，再把两个有序区间合并。", baseArrayState(arr), `初始序列：${fmtArray(arr)}`);
  function merge(l, m, r) {
    addStep(steps, 6, `准备合并两个有序区间 [${l}, ${m}] 和 [${m + 1}, ${r}]。`, baseArrayState(arr, { active: [l, m, r], markers: [`merge(${l},${m},${r})`] }), "合并开始");
    const left = arr.slice(l, m + 1);
    const right = arr.slice(m + 1, r + 1);
    let i = 0, j = 0, k = l;
    addStep(steps, 7, `i、j 分别指向左右临时数组开头，k 指向原数组回填位置。`, baseArrayState(arr, { active: [k], markers: [`L=[${left}]`, `R=[${right}]`] }), "初始化三个指针");
    while (i < left.length && j < right.length) {
      addStep(steps, 8, `比较左数组 ${left[i]} 和右数组 ${right[j]}，小的先回填。`, baseArrayState(arr, { compare: [k], markers: [`L[i]=${left[i]}`, `R[j]=${right[j]}`, `k=${k}`] }), "比较两个有序区间头元素");
      if (left[i] <= right[j]) {
        arr[k] = left[i];
        addStep(steps, 9, `${left[i]} 更小或相等，A[${k}] = ${left[i]}。`, baseArrayState(arr, { active: [k], markers: [`取左边`] }), `当前序列：${fmtArray(arr)}`);
        i++;
      } else {
        arr[k] = right[j];
        addStep(steps, 11, `${right[j]} 更小，A[${k}] = ${right[j]}。`, baseArrayState(arr, { active: [k], markers: [`取右边`] }), `当前序列：${fmtArray(arr)}`);
        j++;
      }
      k++;
      addStep(steps, 13, `k++，继续回填下一个位置。`, baseArrayState(arr, { active: [Math.min(k, arr.length - 1)], markers: [`k=${k}`] }), "回填指针后移");
    }
    while (i < left.length) {
      arr[k] = left[i];
      addStep(steps, 14, `右数组已空，把左数组剩余元素 ${left[i]} 复制回 A[${k}]。`, baseArrayState(arr, { active: [k], markers: [`复制左剩余`] }), `当前序列：${fmtArray(arr)}`);
      i++; k++;
    }
    while (j < right.length) {
      arr[k] = right[j];
      addStep(steps, 15, `左数组已空，把右数组剩余元素 ${right[j]} 复制回 A[${k}]。`, baseArrayState(arr, { active: [k], markers: [`复制右剩余`] }), `当前序列：${fmtArray(arr)}`);
      j++; k++;
    }
    addStep(steps, 16, `区间 [${l}, ${r}] 合并完成。`, baseArrayState(arr, { sorted: Array.from({ length: r - l + 1 }, (_, x) => l + x), markers: [`合并完成`] }), `当前序列：${fmtArray(arr)}`);
  }
  function sort(l, r) {
    addStep(steps, 1, `MergeSort(A, ${l}, ${r})，判断是否需要继续拆分。`, baseArrayState(arr, { active: [l, r], markers: [`区间 [${l},${r}]`] }), "递归入口");
    if (l < r) {
      const m = Math.floor((l + r) / 2);
      addStep(steps, 2, `mid = ${m}，把区间拆成 [${l},${m}] 和 [${m + 1},${r}]。`, baseArrayState(arr, { active: [l, m, r], markers: [`mid=${m}`] }), "二分拆分");
      addStep(steps, 3, `递归排序左半区 [${l},${m}]。`, baseArrayState(arr, { active: [l, m], markers: [`左递归`] }), "处理左半区");
      sort(l, m);
      addStep(steps, 4, `递归排序右半区 [${m + 1},${r}]。`, baseArrayState(arr, { active: [m + 1, r], markers: [`右递归`] }), "处理右半区");
      sort(m + 1, r);
      addStep(steps, 5, `左右区间已有序，开始归并。`, baseArrayState(arr, { active: [l, m, r], markers: [`准备 merge`] }), "合并前");
      merge(l, m, r);
    } else {
      addStep(steps, 1, `区间 [${l},${r}] 只有一个元素，天然有序。`, baseArrayState(arr, { active: [l], markers: [`递归出口`] }), "递归返回");
    }
  }
  sort(0, arr.length - 1);
  addStep(steps, 16, "归并排序完成。稳定，时间复杂度 O(nlogn)，但需要 O(n) 辅助空间。", baseArrayState(arr, { sorted: [0, 1, 2, 3, 4, 5] }), `最终序列：${fmtArray(arr)}`);
  return steps;
}

function buildBstInsertSteps() {
  const steps = [];
  addStep(steps, 0, "二叉排序树插入：从根结点开始，若小于当前结点走左子树，否则走右子树。", { kind: "tree", nodes: TREE_BASE_NODES, edges: TREE_BASE_EDGES, current: ["50"], note: "待插入关键字：65" }, "插入 key = 65");
  addStep(steps, 1, "当前结点 p 指向 50，p != NULL，进入循环。", { kind: "tree", nodes: TREE_BASE_NODES, edges: TREE_BASE_EDGES, current: ["50"], note: "p = 50" }, "while 条件成立");
  addStep(steps, 2, "保存父结点 parent = 50，后面找到空位置时要接到 parent 下面。", { kind: "tree", nodes: TREE_BASE_NODES, edges: TREE_BASE_EDGES, current: ["50"], visited: ["50"], note: "parent = 50" }, "记录父结点");
  addStep(steps, 5, "65 > 50，应该进入右子树。", { kind: "tree", nodes: TREE_BASE_NODES, edges: TREE_BASE_EDGES, current: ["50"], activeEdges: [["50", "70"]], visited: ["50"], note: "key > p->data，p = p->rchild" }, "向右走");
  addStep(steps, 1, "p 移动到 70，继续判断。", { kind: "tree", nodes: TREE_BASE_NODES, edges: TREE_BASE_EDGES, current: ["70"], visited: ["50"], note: "p = 70" }, "while 条件成立");
  addStep(steps, 2, "保存父结点 parent = 70。", { kind: "tree", nodes: TREE_BASE_NODES, edges: TREE_BASE_EDGES, current: ["70"], visited: ["50", "70"], note: "parent = 70" }, "记录父结点");
  addStep(steps, 3, "65 < 70，应该进入左子树。", { kind: "tree", nodes: TREE_BASE_NODES, edges: TREE_BASE_EDGES, current: ["70"], activeEdges: [["70", "60"]], visited: ["50", "70"], note: "key < p->data，p = p->lchild" }, "向左走");
  addStep(steps, 1, "p 移动到 60，继续判断。", { kind: "tree", nodes: TREE_BASE_NODES, edges: TREE_BASE_EDGES, current: ["60"], visited: ["50", "70"], note: "p = 60" }, "while 条件成立");
  addStep(steps, 2, "保存父结点 parent = 60。", { kind: "tree", nodes: TREE_BASE_NODES, edges: TREE_BASE_EDGES, current: ["60"], visited: ["50", "70", "60"], note: "parent = 60" }, "记录父结点");
  addStep(steps, 5, "65 > 60，进入右子树。右孩子为空，说明插入位置找到了。", { kind: "tree", nodes: TREE_BASE_NODES, edges: TREE_BASE_EDGES, current: ["60"], visited: ["50", "70", "60"], note: "p = NULL，找到插入位置" }, "向右走到空位置");
  addStep(steps, 8, "创建新结点 65。", { kind: "tree", nodes: TREE_WITH_65_NODES, edges: TREE_BASE_EDGES, current: ["60"], insert: ["65"], visited: ["50", "70", "60"], note: "new Node(65)" }, "生成新结点");
  addStep(steps, 11, "因为 65 > parent->data，即 65 > 60，所以把 65 接为 60 的右孩子。", { kind: "tree", nodes: TREE_WITH_65_NODES, edges: TREE_WITH_65_EDGES, current: ["60"], insert: ["65"], activeEdges: [["60", "65"]], visited: ["50", "70", "60"], note: "parent->rchild = s" }, "插入完成");
  return steps;
}

function buildBstSearchSteps() {
  const steps = [];
  addStep(steps, 0, "二叉排序树查找：利用左小右大的性质，每次排除一半方向。", { kind: "tree", nodes: TREE_BASE_NODES, edges: TREE_BASE_EDGES, current: ["50"], note: "查找 key = 60" }, "目标 key = 60");
  addStep(steps, 1, "T 不为空，且 60 != 50，继续比较方向。", { kind: "tree", nodes: TREE_BASE_NODES, edges: TREE_BASE_EDGES, current: ["50"], visited: ["50"], note: "key 与当前结点比较" }, "while 条件成立");
  addStep(steps, 4, "60 > 50，进入右子树。", { kind: "tree", nodes: TREE_BASE_NODES, edges: TREE_BASE_EDGES, current: ["50"], visited: ["50"], activeEdges: [["50", "70"]], note: "T = T->rchild" }, "向右查找");
  addStep(steps, 1, "来到 70，60 != 70，继续比较。", { kind: "tree", nodes: TREE_BASE_NODES, edges: TREE_BASE_EDGES, current: ["70"], visited: ["50", "70"], note: "当前结点 70" }, "while 条件成立");
  addStep(steps, 2, "60 < 70，进入左子树。", { kind: "tree", nodes: TREE_BASE_NODES, edges: TREE_BASE_EDGES, current: ["70"], visited: ["50", "70"], activeEdges: [["70", "60"]], note: "T = T->lchild" }, "向左查找");
  addStep(steps, 1, "来到 60，key == T->data，循环结束。", { kind: "tree", nodes: TREE_BASE_NODES, edges: TREE_BASE_EDGES, current: ["60"], target: ["60"], visited: ["50", "70", "60"], note: "找到目标结点" }, "查找成功");
  addStep(steps, 6, "返回结点 60。若走到空指针仍没找到，则返回 NULL。", { kind: "tree", nodes: TREE_BASE_NODES, edges: TREE_BASE_EDGES, target: ["60"], visited: ["50", "70", "60"], note: "return T" }, "查找结果：60");
  return steps;
}

const TRAVERSAL_TREE_NODES = [
  { id: "A", label: "A", x: 400, y: 55 },
  { id: "B", label: "B", x: 240, y: 140 },
  { id: "C", label: "C", x: 560, y: 140 },
  { id: "D", label: "D", x: 145, y: 240 },
  { id: "E", label: "E", x: 335, y: 240 },
  { id: "F", label: "F", x: 495, y: 240 },
  { id: "G", label: "G", x: 655, y: 240 },
];
const TRAVERSAL_TREE_EDGES = [["A", "B"], ["A", "C"], ["B", "D"], ["B", "E"], ["C", "F"], ["C", "G"]];
const TRAVERSAL_CHILDREN = { A: ["B", "C"], B: ["D", "E"], C: ["F", "G"], D: [null, null], E: [null, null], F: [null, null], G: [null, null] };

function buildTraversalSteps(orderType) {
  const steps = [];
  const output = [];
  const visited = [];
  const titles = { preorder: "先序遍历", inorder: "中序遍历", postorder: "后序遍历" };
  addStep(steps, 0, `${titles[orderType]}递归模板：每个结点都经历“到达、处理左子树、处理右子树、返回”。`, { kind: "tree", nodes: TRAVERSAL_TREE_NODES, edges: TRAVERSAL_TREE_EDGES, current: ["A"], note: "示例二叉树：A 为根" }, "准备遍历");
  function visit(node, depth = 0) {
    if (!node) {
      addStep(steps, 1, "遇到空指针，直接 return。", { kind: "tree", nodes: TRAVERSAL_TREE_NODES, edges: TRAVERSAL_TREE_EDGES, visited, note: "T == NULL" }, `输出：${output.join(" ") || "空"}`);
      return;
    }
    addStep(steps, 1, `进入结点 ${node}，T != NULL。`, { kind: "tree", nodes: TRAVERSAL_TREE_NODES, edges: TRAVERSAL_TREE_EDGES, current: [node], visited, note: `递归深度 ${depth}` }, `输出：${output.join(" ") || "空"}`);
    const [left, right] = TRAVERSAL_CHILDREN[node];
    if (orderType === "preorder") {
      output.push(node); visited.push(node);
      addStep(steps, 2, `先序：先访问根结点 ${node}。`, { kind: "tree", nodes: TRAVERSAL_TREE_NODES, edges: TRAVERSAL_TREE_EDGES, current: [node], visited, note: "访问顺序：根 → 左 → 右" }, `输出：${output.join(" → ")}`);
    }
    addStep(steps, orderType === "preorder" ? 3 : 2, `递归遍历 ${node} 的左子树。`, { kind: "tree", nodes: TRAVERSAL_TREE_NODES, edges: TRAVERSAL_TREE_EDGES, current: [node], visited, activeEdges: left ? [[node, left]] : [], note: `${node}->lchild` }, `输出：${output.join(" → ") || "空"}`);
    visit(left, depth + 1);
    if (orderType === "inorder") {
      output.push(node); visited.push(node);
      addStep(steps, 3, `中序：左子树完成后访问根结点 ${node}。`, { kind: "tree", nodes: TRAVERSAL_TREE_NODES, edges: TRAVERSAL_TREE_EDGES, current: [node], visited, note: "访问顺序：左 → 根 → 右" }, `输出：${output.join(" → ")}`);
    }
    addStep(steps, orderType === "preorder" ? 4 : 4, `递归遍历 ${node} 的右子树。`, { kind: "tree", nodes: TRAVERSAL_TREE_NODES, edges: TRAVERSAL_TREE_EDGES, current: [node], visited, activeEdges: right ? [[node, right]] : [], note: `${node}->rchild` }, `输出：${output.join(" → ") || "空"}`);
    visit(right, depth + 1);
    if (orderType === "postorder") {
      output.push(node); visited.push(node);
      addStep(steps, 4, `后序：左右子树都完成后，最后访问根结点 ${node}。`, { kind: "tree", nodes: TRAVERSAL_TREE_NODES, edges: TRAVERSAL_TREE_EDGES, current: [node], visited, note: "访问顺序：左 → 右 → 根" }, `输出：${output.join(" → ")}`);
    }
    addStep(steps, 5, `结点 ${node} 的递归调用结束，返回上一层。`, { kind: "tree", nodes: TRAVERSAL_TREE_NODES, edges: TRAVERSAL_TREE_EDGES, visited, note: `return from ${node}` }, `输出：${output.join(" → ") || "空"}`);
  }
  visit("A");
  addStep(steps, 5, `${titles[orderType]}完成。`, { kind: "tree", nodes: TRAVERSAL_TREE_NODES, edges: TRAVERSAL_TREE_EDGES, visited, note: "遍历结束" }, `最终输出：${output.join(" → ")}`);
  return steps;
}

function buildLevelOrderSteps() {
  const steps = [];
  const queue = ["A"];
  const output = [];
  const visited = [];
  addStep(steps, 0, "层序遍历使用队列：根结点先入队，然后反复出队访问，再让左右孩子入队。", { kind: "tree", nodes: TRAVERSAL_TREE_NODES, edges: TRAVERSAL_TREE_EDGES, current: ["A"], note: "队列 Q = [A]" }, "准备层序遍历");
  addStep(steps, 1, "根结点 A 入队。", { kind: "tree", nodes: TRAVERSAL_TREE_NODES, edges: TRAVERSAL_TREE_EDGES, current: ["A"], note: "enqueue(A)" }, "Q = [A]");
  while (queue.length) {
    addStep(steps, 2, "队列非空，继续循环。", { kind: "tree", nodes: TRAVERSAL_TREE_NODES, edges: TRAVERSAL_TREE_EDGES, current: [queue[0]], visited, note: `Q = [${queue.join(", ")}]` }, `输出：${output.join(" → ") || "空"}`);
    const node = queue.shift();
    addStep(steps, 3, `出队结点 ${node}。`, { kind: "tree", nodes: TRAVERSAL_TREE_NODES, edges: TRAVERSAL_TREE_EDGES, current: [node], visited, note: `dequeue ${node}` }, `Q = [${queue.join(", ")}]`);
    output.push(node); visited.push(node);
    addStep(steps, 4, `访问结点 ${node}。`, { kind: "tree", nodes: TRAVERSAL_TREE_NODES, edges: TRAVERSAL_TREE_EDGES, current: [node], visited, note: "visit(p)" }, `输出：${output.join(" → ")}`);
    const [left, right] = TRAVERSAL_CHILDREN[node];
    if (left) {
      queue.push(left);
      addStep(steps, 5, `${node} 有左孩子 ${left}，左孩子入队。`, { kind: "tree", nodes: TRAVERSAL_TREE_NODES, edges: TRAVERSAL_TREE_EDGES, current: [left], visited, activeEdges: [[node, left]], note: `enqueue ${left}` }, `Q = [${queue.join(", ")}]`);
    }
    if (right) {
      queue.push(right);
      addStep(steps, 6, `${node} 有右孩子 ${right}，右孩子入队。`, { kind: "tree", nodes: TRAVERSAL_TREE_NODES, edges: TRAVERSAL_TREE_EDGES, current: [right], visited, activeEdges: [[node, right]], note: `enqueue ${right}` }, `Q = [${queue.join(", ")}]`);
    }
  }
  addStep(steps, 8, "队列为空，层序遍历结束。", { kind: "tree", nodes: TRAVERSAL_TREE_NODES, edges: TRAVERSAL_TREE_EDGES, visited, note: "Q 为空" }, `最终输出：${output.join(" → ")}`);
  return steps;
}

function buildBfsSteps() {
  const steps = [];
  const adj = { A: ["B", "C"], B: ["D", "E"], C: ["E"], D: ["F"], E: ["F"], F: [] };
  const visited = new Set(["A"]);
  const queue = ["A"];
  const output = [];
  addStep(steps, 0, "BFS 使用队列，适合求无权图最短路径层数。", { kind: "graph", nodes: GRAPH_NODES, edges: GRAPH_EDGES, current: ["A"], visited: ["A"], queue, output }, "起点 A 入队并标记访问");
  while (queue.length) {
    addStep(steps, 3, "队列非空，取队头结点。", { kind: "graph", nodes: GRAPH_NODES, edges: GRAPH_EDGES, current: [queue[0]], visited: [...visited], queue, output }, "while 循环");
    const u = queue.shift();
    output.push(u);
    addStep(steps, 4, `出队 ${u} 并访问。`, { kind: "graph", nodes: GRAPH_NODES, edges: GRAPH_EDGES, current: [u], visited: [...visited], queue, output }, `访问序列：${output.join(" → ")}`);
    for (const v of adj[u]) {
      addStep(steps, 5, `检查 ${u} 的邻接点 ${v}。`, { kind: "graph", nodes: GRAPH_NODES, edges: GRAPH_EDGES, current: [u, v], visited: [...visited], activeEdges: [{ from: u, to: v }], queue, output }, "扫描邻接表");
      addStep(steps, 6, visited.has(v) ? `${v} 已访问，不入队。` : `${v} 未访问，标记并入队。`, { kind: "graph", nodes: GRAPH_NODES, edges: GRAPH_EDGES, current: [v], visited: [...visited], activeEdges: [{ from: u, to: v }], queue, output }, "判断 visited[v]");
      if (!visited.has(v)) {
        visited.add(v);
        queue.push(v);
        addStep(steps, 7, `${v} 入队，等待后续访问。`, { kind: "graph", nodes: GRAPH_NODES, edges: GRAPH_EDGES, current: [v], visited: [...visited], activeEdges: [{ from: u, to: v }], queue, output }, `Q = [${queue.join(", ")}]`);
      }
    }
  }
  addStep(steps, 10, "队列为空，BFS 结束。", { kind: "graph", nodes: GRAPH_NODES, edges: GRAPH_EDGES, visited: [...visited], output }, `最终访问序列：${output.join(" → ")}`);
  return steps;
}

function buildDfsSteps() {
  const steps = [];
  const adj = { A: ["B", "C"], B: ["D", "E"], C: ["E"], D: ["F"], E: ["F"], F: [] };
  const visited = new Set();
  const output = [];
  const stack = [];
  addStep(steps, 0, "DFS 使用递归或栈，沿着一条路径尽可能深入，再回溯。", { kind: "graph", nodes: GRAPH_NODES, edges: GRAPH_EDGES, current: ["A"], stack: ["A"], output }, "从 A 开始 DFS");
  function dfs(u) {
    stack.push(u);
    addStep(steps, 1, `进入 DFS(${u})。`, { kind: "graph", nodes: GRAPH_NODES, edges: GRAPH_EDGES, current: [u], visited: [...visited], stack, output }, "递归调用入栈");
    visited.add(u); output.push(u);
    addStep(steps, 2, `访问并标记 ${u}。`, { kind: "graph", nodes: GRAPH_NODES, edges: GRAPH_EDGES, current: [u], visited: [...visited], stack, output }, `访问序列：${output.join(" → ")}`);
    for (const v of adj[u]) {
      addStep(steps, 3, `检查 ${u} 的邻接点 ${v}。`, { kind: "graph", nodes: GRAPH_NODES, edges: GRAPH_EDGES, current: [u, v], visited: [...visited], activeEdges: [{ from: u, to: v }], stack, output }, "扫描邻接点");
      addStep(steps, 4, visited.has(v) ? `${v} 已访问，跳过。` : `${v} 未访问，递归进入 DFS(${v})。`, { kind: "graph", nodes: GRAPH_NODES, edges: GRAPH_EDGES, current: [v], visited: [...visited], activeEdges: [{ from: u, to: v }], stack, output }, "判断 visited[v]");
      if (!visited.has(v)) dfs(v);
    }
    stack.pop();
    addStep(steps, 6, `${u} 的所有邻接点处理完毕，递归返回。`, { kind: "graph", nodes: GRAPH_NODES, edges: GRAPH_EDGES, visited: [...visited], stack, output }, "回溯");
  }
  dfs("A");
  addStep(steps, 8, "DFS 结束。", { kind: "graph", nodes: GRAPH_NODES, edges: GRAPH_EDGES, visited: [...visited], output }, `最终访问序列：${output.join(" → ")}`);
  return steps;
}

function buildDijkstraSteps() {
  const steps = [];
  const nodes = ["A", "B", "C", "D", "E", "F"];
  const adj = {
    A: [{ to: "B", w: 2 }, { to: "C", w: 5 }],
    B: [{ to: "D", w: 4 }, { to: "E", w: 6 }],
    C: [{ to: "B", w: 1 }, { to: "E", w: 2 }],
    D: [{ to: "F", w: 3 }],
    E: [{ to: "F", w: 1 }],
    F: [],
  };
  const dist = Object.fromEntries(nodes.map(n => [n, Infinity]));
  const prev = {};
  const done = new Set();
  dist.A = 0;
  addStep(steps, 0, "Dijkstra 用于非负权图单源最短路径，核心是不断选择当前 dist 最小的未确定结点。", { kind: "graph", nodes: GRAPH_NODES, edges: GRAPH_EDGES, current: ["A"], dist, output: [] }, "源点 A，dist[A]=0，其余为 ∞");
  while (done.size < nodes.length) {
    addStep(steps, 3, "在所有未确定结点中，选择 dist 最小的结点 u。", { kind: "graph", nodes: GRAPH_NODES, edges: GRAPH_EDGES, visited: [...done], dist }, "选择最小 dist");
    let u = null;
    for (const n of nodes) {
      if (!done.has(n) && (u === null || dist[n] < dist[u])) u = n;
    }
    if (u === null || dist[u] === Infinity) break;
    addStep(steps, 4, `选中 ${u}，dist[${u}] = ${dist[u]}，将其最短距离确定。`, { kind: "graph", nodes: GRAPH_NODES, edges: GRAPH_EDGES, current: [u], visited: [...done], dist }, "确定 u");
    done.add(u);
    addStep(steps, 5, `标记 ${u} 已确定。`, { kind: "graph", nodes: GRAPH_NODES, edges: GRAPH_EDGES, current: [u], visited: [...done], dist }, "S 集合扩大");
    for (const edge of adj[u]) {
      const v = edge.to;
      addStep(steps, 6, `检查边 ${u} → ${v}，权值 ${edge.w}。`, { kind: "graph", nodes: GRAPH_NODES, edges: GRAPH_EDGES, current: [u, v], visited: [...done], activeEdges: [{ from: u, to: v }], dist }, "松弛前检查边");
      const cand = dist[u] + edge.w;
      addStep(steps, 7, cand < dist[v] ? `dist[${u}] + ${edge.w} = ${cand} < dist[${v}]，需要更新。` : `dist[${u}] + ${edge.w} = ${cand}，不能改进 dist[${v}]。`, { kind: "graph", nodes: GRAPH_NODES, edges: GRAPH_EDGES, current: [v], visited: [...done], activeEdges: [{ from: u, to: v }], dist }, "判断是否松弛");
      if (cand < dist[v]) {
        dist[v] = cand;
        prev[v] = u;
        addStep(steps, 8, `更新 dist[${v}] = ${cand}，前驱 prev[${v}] = ${u}。`, { kind: "graph", nodes: GRAPH_NODES, edges: GRAPH_EDGES, current: [v], visited: [...done], activeEdges: [{ from: u, to: v }], dist }, "完成松弛");
      }
    }
  }
  const pathEdges = [];
  let x = "F";
  while (prev[x]) {
    pathEdges.unshift({ from: prev[x], to: x });
    x = prev[x];
  }
  addStep(steps, 11, "所有可达结点的最短路径确定。绿色边显示从 A 到 F 的一条最短路径。", { kind: "graph", nodes: GRAPH_NODES, edges: GRAPH_EDGES, visited: [...done], target: ["F"], dist, pathEdges }, `A 到 F 最短距离：${dist.F}`);
  return steps;
}

function buildTopoSteps() {
  const steps = [];
  const adj = { A: ["B", "C"], B: ["D"], C: ["D", "E"], D: ["F"], E: ["F"], F: [] };
  const indegree = { A: 0, B: 1, C: 1, D: 2, E: 1, F: 2 };
  const queue = ["A"];
  const output = [];
  addStep(steps, 0, "拓扑排序适用于有向无环图：每次选择入度为 0 的顶点输出。", { kind: "graph", nodes: DAG_NODES, edges: DAG_EDGES, current: ["A"], queue, indegree, output }, "初始入度计算完成");
  addStep(steps, 2, "把所有入度为 0 的顶点入队。", { kind: "graph", nodes: DAG_NODES, edges: DAG_EDGES, current: ["A"], queue, indegree, output }, "Q = [A]");
  while (queue.length) {
    addStep(steps, 3, "队列非空，取出一个入度为 0 的顶点。", { kind: "graph", nodes: DAG_NODES, edges: DAG_EDGES, current: [queue[0]], queue, indegree, output }, "while 循环");
    const u = queue.shift();
    output.push(u);
    addStep(steps, 4, `输出 ${u}。`, { kind: "graph", nodes: DAG_NODES, edges: DAG_EDGES, current: [u], visited: output, queue, indegree, output }, `拓扑序：${output.join(" → ")}`);
    for (const v of adj[u]) {
      addStep(steps, 5, `删除边 ${u} → ${v}，相当于让 ${v} 的入度减 1。`, { kind: "graph", nodes: DAG_NODES, edges: DAG_EDGES, current: [u, v], activeEdges: [{ from: u, to: v }], visited: output, queue, indegree, output }, "处理出边");
      indegree[v] -= 1;
      addStep(steps, 6, `${v} 的入度变为 ${indegree[v]}。`, { kind: "graph", nodes: DAG_NODES, edges: DAG_EDGES, current: [v], visited: output, queue, indegree, output }, "入度减一");
      if (indegree[v] === 0) {
        queue.push(v);
        addStep(steps, 8, `${v} 入度为 0，入队。`, { kind: "graph", nodes: DAG_NODES, edges: DAG_EDGES, current: [v], visited: output, queue, indegree, output }, `Q = [${queue.join(", ")}]`);
      }
    }
  }
  addStep(steps, 11, output.length === Object.keys(indegree).length ? "输出顶点数等于图中顶点数，说明不存在环。" : "若输出顶点数小于图中顶点数，则说明存在环。", { kind: "graph", nodes: DAG_NODES, edges: DAG_EDGES, visited: output, indegree, output }, `最终拓扑序：${output.join(" → ")}`);
  return steps;
}

function buildStackSteps() {
  const steps = [];
  let stack = [];
  addStep(steps, 0, "栈是后进先出 LIFO，top 始终指向栈顶。", { kind: "linear", structure: "stack", items: stack }, "空栈");
  for (const x of ["A", "B", "C"]) {
    addStep(steps, 1, `判断栈是否已满，未满才能进栈。`, { kind: "linear", structure: "stack", items: stack }, "判满");
    addStep(steps, 3, `top++，准备把 ${x} 放到新的栈顶位置。`, { kind: "linear", structure: "stack", items: stack }, "top 上移");
    stack.push(x);
    addStep(steps, 4, `${x} 进栈。`, { kind: "linear", structure: "stack", items: stack, active: stack.length - 1 }, `栈：${stack.join(" → ")}`);
  }
  for (let k = 0; k < 2; k++) {
    addStep(steps, 7, "判断栈是否为空，非空才能出栈。", { kind: "linear", structure: "stack", items: stack, active: stack.length - 1 }, "判空");
    const x = stack[stack.length - 1];
    addStep(steps, 9, `读取栈顶元素 ${x}。`, { kind: "linear", structure: "stack", items: stack, active: stack.length - 1 }, `出栈元素：${x}`);
    stack.pop();
    addStep(steps, 10, "top--，栈顶下移。", { kind: "linear", structure: "stack", items: stack, active: stack.length - 1 }, `栈：${stack.join(" → ") || "空"}`);
  }
  return steps;
}

function buildQueueSteps() {
  const steps = [];
  let queue = [];
  addStep(steps, 0, "队列是先进先出 FIFO，front 指向队头，rear 指向队尾。", { kind: "linear", structure: "queue", items: queue }, "空队列");
  for (const x of ["A", "B", "C"]) {
    addStep(steps, 1, "判断队列是否已满。", { kind: "linear", structure: "queue", items: queue }, "判满");
    queue.push(x);
    addStep(steps, 3, `${x} 入队，放到 rear 端。`, { kind: "linear", structure: "queue", items: queue, active: queue.length - 1 }, `队列：${queue.join(" → ")}`);
  }
  for (let k = 0; k < 2; k++) {
    addStep(steps, 6, "判断队列是否为空。", { kind: "linear", structure: "queue", items: queue, active: 0 }, "判空");
    const x = queue.shift();
    addStep(steps, 8, `队头元素 ${x} 出队。`, { kind: "linear", structure: "queue", items: queue, active: 0 }, `出队元素：${x}；剩余：${queue.join(" → ") || "空"}`);
  }
  return steps;
}

function buildLinkedInsertSteps() {
  const steps = [];
  const before = ["A", "B", "D", "E"];
  addStep(steps, 0, "单链表插入的关键：先让新结点指向后继，再让前驱指向新结点。顺序不能反。", { kind: "linear", structure: "list", items: before, active: 1 }, "目标：在 B 后插入 C");
  addStep(steps, 1, "找到前驱结点 p，即结点 B。", { kind: "linear", structure: "list", items: before, active: 1 }, "p 指向 B");
  addStep(steps, 2, "创建新结点 s，数据域为 C。", { kind: "linear", structure: "list", items: ["A", "B", "C", "D", "E"], active: 1, newIndex: 2 }, "s = new Node(C)");
  addStep(steps, 3, "先执行 s->next = p->next，让 C 指向原来 B 的后继 D。", { kind: "linear", structure: "list", items: ["A", "B", "C", "D", "E"], active: 2, newIndex: 2 }, "C → D");
  addStep(steps, 4, "再执行 p->next = s，让 B 指向 C。", { kind: "linear", structure: "list", items: ["A", "B", "C", "D", "E"], active: 1, newIndex: 2 }, "B → C");
  addStep(steps, 5, "插入完成，链表顺序变为 A → B → C → D → E。", { kind: "linear", structure: "list", items: ["A", "B", "C", "D", "E"], newIndex: 2 }, "插入成功");
  return steps;
}

const DEMO_LIBRARY = {
  bubble: {
    title: "冒泡排序",
    category: "排序 / 交换类排序",
    code: [
      "void BubbleSort(int A[], int n) {",
      "    for (int i = 0; i < n - 1; i++) {",
      "        for (int j = 0; j < n - 1 - i; j++) {",
      "            if (A[j] > A[j + 1]) {",
      "                swap(A[j], A[j + 1]);",
      "            }",
      "        }",
      "    }",
      "}"
    ],
    examTips: sortingTips(["冒泡排序稳定；最好 O(n)，需加交换标志；普通写法最坏/平均 O(n²)。"]),
    buildSteps: buildBubbleSteps,
  },
  selection: {
    title: "选择排序",
    category: "排序 / 选择类排序",
    code: [
      "void SelectSort(int A[], int n) {",
      "    for (int i = 0; i < n - 1; i++) {",
      "        int min = i;",
      "        for (int j = i + 1; j < n; j++) {",
      "            if (A[j] < A[min])",
      "                min = j;",
      "        }",
      "        swap(A[i], A[min]);",
      "    }",
      "}"
    ],
    examTips: sortingTips(["简单选择排序不稳定；比较次数固定为 n(n-1)/2；交换次数最多 n-1。"]),
    buildSteps: buildSelectionSteps,
  },
  insertion: {
    title: "直接插入排序",
    category: "排序 / 插入类排序",
    code: [
      "void InsertSort(int A[], int n) {",
      "    for (int i = 1; i < n; i++) {",
      "        int key = A[i], j = i - 1;",
      "        while (j >= 0 && A[j] > key) {",
      "            A[j + 1] = A[j];",
      "            j--;",
      "        }",
      "        A[j + 1] = key;",
      "    }",
      "}"
    ],
    examTips: sortingTips(["直接插入排序稳定；最好 O(n)，最坏 O(n²)；基本有序时效率高。"]),
    buildSteps: buildInsertionSteps,
  },
  quick: {
    title: "快速排序",
    category: "排序 / 交换类排序 / 分治",
    code: [
      "void QuickSort(int A[], int low, int high) {",
      "    if (low < high) {",
      "        int p = Partition(A, low, high);",
      "        QuickSort(A, low, p - 1);",
      "        QuickSort(A, p + 1, high);",
      "    }",
      "}",
      "int Partition(int A[], int low, int high) {",
      "    int pivot = A[high];",
      "    int i = low - 1;",
      "    for (int j = low; j < high; j++) {",
      "        if (A[j] <= pivot) {",
      "            i++; swap(A[i], A[j]);",
      "        }",
      "    }",
      "    swap(A[i + 1], A[high]);",
      "    return i + 1;",
      "}"
    ],
    examTips: sortingTips(["快排不稳定；平均 O(nlogn)，最坏 O(n²)；递归栈平均 O(logn)。"]),
    buildSteps: buildQuickSteps,
  },
  merge: {
    title: "归并排序",
    category: "排序 / 归并类排序 / 分治",
    code: [
      "void MergeSort(int A[], int l, int r) {",
      "    if (l < r) {",
      "        int m = (l + r) / 2;",
      "        MergeSort(A, l, m);",
      "        MergeSort(A, m + 1, r);",
      "        Merge(A, l, m, r);",
      "    }",
      "}",
      "void Merge(int A[], int l, int m, int r) {",
      "    // L[] 和 R[] 是左右两个有序临时数组",
      "    while (i < L_len && j < R_len) {",
      "        if (L[i] <= R[j]) A[k++] = L[i++];",
      "        else A[k++] = R[j++];",
      "    }",
      "    while (i < L_len) A[k++] = L[i++];",
      "    while (j < R_len) A[k++] = R[j++];",
      "}"
    ],
    examTips: sortingTips(["归并排序稳定；时间复杂度始终 O(nlogn)；空间复杂度 O(n)。"]),
    buildSteps: buildMergeSteps,
  },
  bst_insert: {
    title: "二叉排序树插入",
    category: "树 / 二叉排序树 BST",
    code: [
      "void BST_Insert(BSTree &T, int key) {",
      "    BSTNode *p = T, *parent = NULL;",
      "    while (p != NULL) {",
      "        parent = p;",
      "        if (key < p->data) p = p->lchild;",
      "        else if (key > p->data) p = p->rchild;",
      "        else return; // 不插入重复关键字",
      "    }",
      "    BSTNode *s = new BSTNode(key);",
      "    if (parent == NULL) T = s;",
      "    else if (key < parent->data) parent->lchild = s;",
      "    else parent->rchild = s;",
      "}"
    ],
    examTips: ["BST 中序遍历得到递增序列。", "查找、插入平均 O(logn)，最坏退化为 O(n)。", "插入时一定要保存 parent，否则找不到新结点挂接位置。"],
    buildSteps: buildBstInsertSteps,
  },
  bst_search: {
    title: "二叉排序树查找",
    category: "树 / 二叉排序树 BST",
    code: [
      "BSTNode* BST_Search(BSTree T, int key) {",
      "    while (T != NULL && key != T->data) {",
      "        if (key < T->data)",
      "            T = T->lchild;",
      "        else",
      "            T = T->rchild;",
      "    }",
      "    return T;",
      "}"
    ],
    examTips: ["BST 查找路径由关键字比较结果唯一确定。", "失败查找会落到空指针位置。", "平均查找长度和树高密切相关。"],
    buildSteps: buildBstSearchSteps,
  },
  preorder: {
    title: "先序遍历",
    category: "树 / 二叉树遍历",
    code: [
      "void PreOrder(BiTree T) {",
      "    if (T == NULL) return;",
      "    visit(T);",
      "    PreOrder(T->lchild);",
      "    PreOrder(T->rchild);",
      "}"
    ],
    examTips: ["先序序列：根 → 左 → 右。", "已知先序 + 中序可以唯一确定二叉树。", "递归代码重点看 visit(T) 放在什么位置。"],
    buildSteps: () => buildTraversalSteps("preorder"),
  },
  inorder: {
    title: "中序遍历",
    category: "树 / 二叉树遍历",
    code: [
      "void InOrder(BiTree T) {",
      "    if (T == NULL) return;",
      "    InOrder(T->lchild);",
      "    visit(T);",
      "    InOrder(T->rchild);",
      "}"
    ],
    examTips: ["中序序列：左 → 根 → 右。", "BST 的中序遍历结果是递增序列。", "已知中序 + 先序/后序可唯一确定二叉树。"],
    buildSteps: () => buildTraversalSteps("inorder"),
  },
  postorder: {
    title: "后序遍历",
    category: "树 / 二叉树遍历",
    code: [
      "void PostOrder(BiTree T) {",
      "    if (T == NULL) return;",
      "    PostOrder(T->lchild);",
      "    PostOrder(T->rchild);",
      "    visit(T);",
      "}"
    ],
    examTips: ["后序序列：左 → 右 → 根。", "释放二叉树常用后序遍历。", "后序最后一个结点一定是根。"],
    buildSteps: () => buildTraversalSteps("postorder"),
  },
  levelorder: {
    title: "层序遍历",
    category: "树 / 二叉树遍历 / 队列应用",
    code: [
      "void LevelOrder(BiTree T) {",
      "    EnQueue(Q, T);",
      "    while (!IsEmpty(Q)) {",
      "        DeQueue(Q, p);",
      "        visit(p);",
      "        if (p->lchild) EnQueue(Q, p->lchild);",
      "        if (p->rchild) EnQueue(Q, p->rchild);",
      "    }",
      "}"
    ],
    examTips: ["层序遍历必须借助队列。", "常和完全二叉树、树高、结点层次一起考。", "出队访问，入队孩子，是核心流程。"],
    buildSteps: buildLevelOrderSteps,
  },
  graph_bfs: {
    title: "图的广度优先搜索 BFS",
    category: "图 / 搜索 / 队列应用",
    code: [
      "void BFS(Graph G, int v) {",
      "    visit(v); visited[v] = true;",
      "    EnQueue(Q, v);",
      "    while (!IsEmpty(Q)) {",
      "        DeQueue(Q, u);",
      "        for (w = FirstNeighbor(G, u); w >= 0; w = NextNeighbor(G, u, w)) {",
      "            if (!visited[w]) {",
      "                visit(w); visited[w] = true;",
      "                EnQueue(Q, w);",
      "            }",
      "        }",
      "    }",
      "}"
    ],
    examTips: ["BFS 使用队列。", "无权图中 BFS 可以求最短路径层数。", "邻接矩阵 BFS 复杂度 O(n²)，邻接表 O(n+e)。"],
    buildSteps: buildBfsSteps,
  },
  graph_dfs: {
    title: "图的深度优先搜索 DFS",
    category: "图 / 搜索 / 递归应用",
    code: [
      "void DFS(Graph G, int v) {",
      "    visit(v);",
      "    visited[v] = true;",
      "    for (w = FirstNeighbor(G, v); w >= 0; w = NextNeighbor(G, v, w)) {",
      "        if (!visited[w])",
      "            DFS(G, w);",
      "    }",
      "}"
    ],
    examTips: ["DFS 使用递归或栈。", "常用于连通分量、拓扑排序、判环等。", "邻接表复杂度 O(n+e)，邻接矩阵 O(n²)。"],
    buildSteps: buildDfsSteps,
  },
  dijkstra: {
    title: "Dijkstra 最短路径",
    category: "图 / 最短路径",
    code: [
      "void Dijkstra(Graph G, int s) {",
      "    InitDist(dist, s);",
      "    for (int i = 0; i < G.vexnum; i++) {",
      "        u = MinDistNotFinal(dist);",
      "        final[u] = true;",
      "        for (each edge u -> v) {",
      "            if (!final[v] && dist[u] + w(u,v) < dist[v]) {",
      "                dist[v] = dist[u] + w(u,v);",
      "                path[v] = u;",
      "            }",
      "        }",
      "    }",
      "}"
    ],
    examTips: ["Dijkstra 只适用于边权非负的图。", "每轮确定一个 dist 最小的未确定顶点。", "408 常考手算 dist/path 表变化。"],
    buildSteps: buildDijkstraSteps,
  },
  toposort: {
    title: "拓扑排序",
    category: "图 / AOV 网 / 队列应用",
    code: [
      "bool TopologicalSort(Graph G) {",
      "    FindInDegree(G, indegree);",
      "    EnQueue all vertices with indegree 0;",
      "    while (!IsEmpty(Q)) {",
      "        DeQueue(Q, v); print(v); count++;",
      "        for (each edge v -> w) {",
      "            indegree[w]--;",
      "            if (indegree[w] == 0)",
      "                EnQueue(Q, w);",
      "        }",
      "    }",
      "    return count == G.vexnum;",
      "}"
    ],
    examTips: ["拓扑排序只能用于有向无环图 DAG。", "若输出顶点数小于总顶点数，说明图中有环。", "队列中多个 0 入度顶点时，拓扑序不唯一。"],
    buildSteps: buildTopoSteps,
  },
  stack: {
    title: "栈的进栈与出栈",
    category: "线性结构 / 栈",
    code: [
      "bool Push(SqStack &S, ElemType x) {",
      "    if (S.top == MaxSize - 1) return false;",
      "    S.top++;",
      "    S.data[S.top] = x;",
      "    return true;",
      "}",
      "bool Pop(SqStack &S, ElemType &x) {",
      "    if (S.top == -1) return false;",
      "    x = S.data[S.top];",
      "    S.top--;",
      "    return true;",
      "}"
    ],
    examTips: ["栈的特点：后进先出 LIFO。", "顺序栈进栈先判满，出栈先判空。", "常考括号匹配、表达式求值、递归转非递归。"],
    buildSteps: buildStackSteps,
  },
  queue: {
    title: "队列的入队与出队",
    category: "线性结构 / 队列",
    code: [
      "bool EnQueue(SqQueue &Q, ElemType x) {",
      "    if ((Q.rear + 1) % MaxSize == Q.front) return false;",
      "    Q.data[Q.rear] = x;",
      "    Q.rear = (Q.rear + 1) % MaxSize;",
      "    return true;",
      "}",
      "bool DeQueue(SqQueue &Q, ElemType &x) {",
      "    if (Q.front == Q.rear) return false;",
      "    x = Q.data[Q.front];",
      "    Q.front = (Q.front + 1) % MaxSize;",
      "    return true;",
      "}"
    ],
    examTips: ["队列的特点：先进先出 FIFO。", "循环队列常考判空、判满、元素个数。", "BFS、层序遍历都依赖队列。"],
    buildSteps: buildQueueSteps,
  },
  linked_insert: {
    title: "单链表插入",
    category: "线性结构 / 链表",
    code: [
      "bool ListInsert(LinkList L, int i, ElemType e) {",
      "    LNode *p = GetElem(L, i - 1);",
      "    LNode *s = new LNode; s->data = e;",
      "    s->next = p->next;",
      "    p->next = s;",
      "    return true;",
      "}"
    ],
    examTips: ["链表插入必须先接后继：s->next = p->next。", "再接前驱：p->next = s。", "删除结点时要保存被删结点，避免内存泄漏。"],
    buildSteps: buildLinkedInsertSteps,
  },
};

setupPaneResizer();

$$(".algo-btn").forEach(btn => btn.addEventListener("click", () => loadDemo(btn.dataset.id)));
$("#nextBtn").addEventListener("click", nextStep);
$("#prevBtn").addEventListener("click", prevStep);
$("#resetBtn").addEventListener("click", resetDemo);
$("#playBtn").addEventListener("click", togglePlay);
speedRange.addEventListener("input", () => {
  if (timer) {
    stopTimer();
    togglePlay();
  }
});

window.addEventListener("keydown", (event) => {
  if (event.target.tagName === "INPUT") return;
  if (event.key === "ArrowRight") nextStep();
  if (event.key === "ArrowLeft") prevStep();
  if (event.key === " ") {
    event.preventDefault();
    togglePlay();
  }
});

loadDemo("bubble");

/* ========================= 408 增强版扩展：树、图、表达式、排序、查找 ========================= */

function safeSet(list) { return new Set(list || []); }
function fmtKeys(keys) { return (keys || []).join(" | "); }

function renderVisual(state) {
  visualCanvas.className = "visual-canvas";
  if (!state) {
    visualCanvas.innerHTML = `<div class="empty-state">暂无可视化状态</div>`;
    return;
  }
  if (state.kind === "array") return renderArray(state);
  if (state.kind === "tree") return renderTree(state);
  if (state.kind === "graph") return renderGraph(state);
  if (state.kind === "linear") return renderLinear(state);
  if (state.kind === "heap") return renderHeap(state);
  if (state.kind === "multiway") return renderMultiway(state);
  if (state.kind === "expression") return renderExpression(state);
  if (state.kind === "forest") return renderForest(state);
  if (state.kind === "custom") return renderCustom(state);
  visualCanvas.innerHTML = `<div class="empty-state">暂无可视化状态</div>`;
}

function renderArray(state) {
  const arr = state.arr || [];
  const numeric = arr.every(x => typeof x === "number");
  const maxVal = numeric ? Math.max(...arr, 1) : 1;
  const compare = safeSet(state.compare);
  const swap = safeSet(state.swap);
  const sorted = safeSet(state.sorted);
  const active = safeSet(state.active);
  const windowSet = safeSet(state.window);
  const pivot = state.pivot;
  const markers = state.markers || [];
  const blockRanges = state.blocks || [];
  const badges = markers.map(m => `<span class="pointer-badge">${escapeHtml(m)}</span>`).join("");

  const bars = arr.map((value, idx) => {
    const classes = [numeric ? "bar" : "array-cell"];
    if (compare.has(idx)) classes.push("compare");
    if (swap.has(idx)) classes.push("swap");
    if (sorted.has(idx)) classes.push("sorted");
    if (pivot === idx) classes.push("pivot");
    if (active.has(idx)) classes.push("active");
    if (windowSet.has(idx)) classes.push("window");
    const height = numeric ? 55 + Number(value) / maxVal * 250 : 58;
    const style = numeric ? `style="height:${height}px"` : "";
    const tag = numeric ? "bar" : "array-cell";
    return `<div class="bar-col"><div class="${classes.join(" ")}" ${style}>${escapeHtml(value)}</div><div class="bar-index">A[${idx}]</div></div>`;
  }).join("");

  const blocks = blockRanges.length ? `<div class="block-row">${blockRanges.map(b => `<span class="block-badge">块${b.name}：A[${b.l}..${b.r}]，最大=${b.max}</span>`).join("")}</div>` : "";
  visualCanvas.innerHTML = `<div class="pointer-row">${badges}</div><div class="bars-wrap ${numeric ? "" : "cell-wrap"}">${bars}</div>${blocks}`;
}

function renderTree(state) {
  const nodes = state.nodes || TREE_BASE_NODES;
  const edges = state.edges || TREE_BASE_EDGES;
  const nodeMap = Object.fromEntries(nodes.map(n => [n.id, n]));
  const visited = safeSet(state.visited);
  const current = safeSet(state.current);
  const target = safeSet(state.target);
  const insert = safeSet(state.insert);
  const danger = safeSet(state.danger);
  const activeEdges = new Set((state.activeEdges || []).map(e => e.join ? e.join("->") : `${e.from}->${e.to}`));
  const edgeEls = edges.map(([a, b]) => {
    const from = nodeMap[a], to = nodeMap[b];
    if (!from || !to) return "";
    const cls = activeEdges.has(`${a}->${b}`) ? "edge active" : "edge";
    return `<line class="${cls}" x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" />`;
  }).join("");
  const nodeEls = nodes.map(n => {
    const cls = ["node"];
    if (visited.has(n.id)) cls.push("visited");
    if (current.has(n.id)) cls.push("current");
    if (target.has(n.id)) cls.push("target", "found");
    if (insert.has(n.id)) cls.push("insert");
    if (danger.has(n.id)) cls.push("danger");
    if (n.color === "red") cls.push("rb-red");
    if (n.color === "black") cls.push("rb-black");
    const small = String(n.label).length > 3 ? " small-text" : "";
    return `<g class="${cls.join(" ")}" transform="translate(${n.x}, ${n.y})"><circle r="24"></circle><text class="${small}" y="1">${escapeHtml(n.label)}</text></g>`;
  }).join("");
  visualCanvas.innerHTML = `<svg class="svg-stage" viewBox="0 0 800 400">${edgeEls}${nodeEls}</svg><div class="graph-note">${escapeHtml(state.note || "绿色表示已访问，橙色表示当前代码正在处理的结点。")}</div>`;
}

function renderGraph(state) {
  const nodes = state.nodes || GRAPH_NODES;
  const edges = state.edges || GRAPH_EDGES;
  const directed = state.directed !== false;
  const nodeMap = Object.fromEntries(nodes.map(n => [n.id, n]));
  const visited = safeSet(state.visited);
  const current = safeSet(state.current);
  const target = safeSet(state.target);
  const activeEdges = new Set((state.activeEdges || []).map(e => `${e.from}->${e.to}`));
  const pathEdges = new Set((state.pathEdges || []).map(e => `${e.from}->${e.to}`));
  const edgeEls = edges.map(e => {
    const from = nodeMap[e.from], to = nodeMap[e.to];
    if (!from || !to) return "";
    const cls = ["edge"];
    if (activeEdges.has(`${e.from}->${e.to}`)) cls.push("active");
    if (pathEdges.has(`${e.from}->${e.to}`)) cls.push("path");
    const dx = to.x - from.x, dy = to.y - from.y, len = Math.sqrt(dx * dx + dy * dy) || 1;
    const sx = from.x + dx / len * 28, sy = from.y + dy / len * 28;
    const tx = to.x - dx / len * 30, ty = to.y - dy / len * 30;
    const lx = (from.x + to.x) / 2, ly = (from.y + to.y) / 2 - 8;
    const label = e.w ? `<text class="edge-label" x="${lx}" y="${ly}">${e.w}</text>` : "";
    return `<line class="${cls.join(" ")}" x1="${sx}" y1="${sy}" x2="${tx}" y2="${ty}" ${directed ? 'marker-end="url(#arrowHead)"' : ""}/>${label}`;
  }).join("");
  const nodeEls = nodes.map(n => {
    const cls = ["node"];
    if (visited.has(n.id)) cls.push("visited");
    if (current.has(n.id)) cls.push("current");
    if (target.has(n.id)) cls.push("target", "found");
    return `<g class="${cls.join(" ")}" transform="translate(${n.x}, ${n.y})"><circle r="25"></circle><text>${escapeHtml(n.label)}</text></g>`;
  }).join("");
  const aux = [];
  if (state.queue) aux.push(`队列 Q：${state.queue.join(" → ") || "空"}`);
  if (state.stack) aux.push(`递归/栈：${state.stack.join(" → ") || "空"}`);
  if (state.indegree) aux.push(`入度：${Object.entries(state.indegree).map(([k, v]) => `${k}:${v}`).join("，")}`);
  if (state.outdegree) aux.push(`出度：${Object.entries(state.outdegree).map(([k, v]) => `${k}:${v}`).join("，")}`);
  if (state.dist) aux.push(`dist：${Object.entries(state.dist).map(([k, v]) => `${k}:${v === Infinity ? "∞" : v}`).join("，")}`);
  if (state.output) aux.push(`输出：${state.output.join(" → ") || "空"}`);
  const note = aux.length ? aux.join("；") : (state.note || (directed ? "有向边用箭头表示。" : "无向图边没有方向，访问相邻点时两端都可走。"));
  visualCanvas.innerHTML = `<svg class="svg-stage" viewBox="0 0 800 400"><defs><marker id="arrowHead" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L0,6 L9,3 z" fill="#6f86a8"></path></marker></defs>${edgeEls}${nodeEls}</svg><div class="graph-note">${escapeHtml(note)}</div>`;
}

function renderHeap(state) {
  const arr = state.arr || [];
  const active = safeSet(state.active);
  const sorted = safeSet(state.sorted);
  const swap = safeSet(state.swap);
  const positions = arr.map((_, i) => {
    const level = Math.floor(Math.log2(i + 1));
    const indexInLevel = i - (2 ** level - 1);
    const count = 2 ** level;
    const x = 800 / (count + 1) * (indexInLevel + 1);
    const y = 55 + level * 86;
    return { x, y };
  });
  const edges = arr.map((_, i) => {
    if (i === 0) return "";
    const p = Math.floor((i - 1) / 2);
    return `<line class="edge" x1="${positions[p].x}" y1="${positions[p].y}" x2="${positions[i].x}" y2="${positions[i].y}" />`;
  }).join("");
  const nodes = arr.map((v, i) => {
    const cls = ["node"];
    if (active.has(i)) cls.push("current");
    if (swap.has(i)) cls.push("target", "found");
    if (sorted.has(i)) cls.push("visited");
    return `<g class="${cls.join(" ")}" transform="translate(${positions[i].x}, ${positions[i].y})"><circle r="24"></circle><text y="1">${v}</text></g>`;
  }).join("");
  const arrayCells = arr.map((v, i) => `<span class="heap-cell ${sorted.has(i) ? "sorted" : ""} ${active.has(i) ? "active" : ""}">${i}:${v}</span>`).join("");
  visualCanvas.innerHTML = `<svg class="svg-stage heap-stage" viewBox="0 0 800 360">${edges}${nodes}</svg><div class="heap-array">顺序存储：${arrayCells}</div><div class="graph-note">${escapeHtml(state.note || "堆是完全二叉树，通常用数组顺序存储。")}</div>`;
}

function renderMultiway(state) {
  const nodes = state.nodes || [];
  const nodeMap = Object.fromEntries(nodes.map(n => [n.id, n]));
  const active = safeSet(state.active);
  const split = safeSet(state.split);
  const leaf = safeSet(state.leaf);
  const edges = (state.edges || []).map(([a, b]) => {
    const from = nodeMap[a], to = nodeMap[b];
    if (!from || !to) return "";
    return `<line class="edge ${active.has(a) && active.has(b) ? "active" : ""}" x1="${from.x}" y1="${from.y + 20}" x2="${to.x}" y2="${to.y - 20}" />`;
  }).join("");
  const links = (state.leafLinks || []).map(([a, b]) => {
    const from = nodeMap[a], to = nodeMap[b];
    if (!from || !to) return "";
    return `<line class="leaf-link" x1="${from.x + 54}" y1="${from.y + 28}" x2="${to.x - 54}" y2="${to.y + 28}" marker-end="url(#arrowHead)" />`;
  }).join("");
  const nodeEls = nodes.map(n => {
    const w = Math.max(70, (n.keys || []).length * 40 + 22);
    const classes = ["multi-node"];
    if (active.has(n.id)) classes.push("active");
    if (split.has(n.id)) classes.push("split");
    if (leaf.has(n.id) || n.leaf) classes.push("leaf");
    const keyCells = (n.keys || []).map(k => `<span>${escapeHtml(k)}</span>`).join("");
    return `<foreignObject x="${n.x - w / 2}" y="${n.y - 23}" width="${w}" height="54"><div class="${classes.join(" ")}">${keyCells}</div></foreignObject>`;
  }).join("");
  visualCanvas.innerHTML = `<svg class="svg-stage" viewBox="0 0 800 400"><defs><marker id="arrowHead" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L0,6 L9,3 z" fill="#6f86a8"></path></marker></defs>${edges}${links}${nodeEls}</svg><div class="graph-note">${escapeHtml(state.note || "多路查找树：一个结点可以存多个关键字，孩子数与关键字范围相关。")}</div>`;
}

function renderExpression(state) {
  const tokens = state.tokens || [];
  const tokenHtml = tokens.map((t, i) => `<span class="token ${i === state.index ? "active" : ""}">${escapeHtml(t)}</span>`).join("");
  const opStack = (state.opStack || []).map(x => `<div class="mini-stack-item">${escapeHtml(x)}</div>`).join("");
  const valStack = (state.valStack || []).map(x => `<div class="mini-stack-item expr-node-chip">${escapeHtml(x)}</div>`).join("");
  const output = (state.output || []).map(x => `<span class="output-token">${escapeHtml(x)}</span>`).join("");
  let treeSvg = "";
  if (state.tree) {
    const nodes = state.tree.nodes || [];
    const edges = state.tree.edges || [];
    const map = Object.fromEntries(nodes.map(n => [n.id, n]));
    const edgeEls = edges.map(([a, b]) => {
      const from = map[a], to = map[b];
      if (!from || !to) return "";
      return `<line class="edge" x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" />`;
    }).join("");
    const nodeEls = nodes.map(n => `<g class="node ${n.op ? "current" : "visited"}" transform="translate(${n.x}, ${n.y})"><circle r="22"></circle><text>${escapeHtml(n.label)}</text></g>`).join("");
    treeSvg = `<svg class="expr-tree" viewBox="0 0 360 220">${edgeEls}${nodeEls}</svg>`;
  }
  visualCanvas.innerHTML = `<div class="expr-wrap"><div class="expr-tokens">${tokenHtml}</div><div class="expr-panels"><div class="expr-panel"><b>运算符栈</b><div class="mini-stack">${opStack || "<span class='muted'>空</span>"}</div></div><div class="expr-panel"><b>输出 / 操作数栈</b><div class="expr-output">${output || valStack || "<span class='muted'>空</span>"}</div></div></div>${treeSvg}</div><div class="graph-note">${escapeHtml(state.note || "中缀转后缀通常看运算符栈；三式互转最推荐画表达式树。")}</div>`;
}

function renderForest(state) {
  const left = state.left || { nodes: [], edges: [] };
  const right = state.right || { nodes: [], edges: [] };
  function part(data, xOffset) {
    const map = Object.fromEntries(data.nodes.map(n => [n.id, n]));
    const edges = (data.edges || []).map(e => {
      const a = Array.isArray(e) ? e[0] : e.from;
      const b = Array.isArray(e) ? e[1] : e.to;
      const kind = Array.isArray(e) ? "" : (e.kind || "");
      const from = map[a], to = map[b];
      if (!from || !to) return "";
      return `<line class="edge ${kind === "sibling" ? "sibling-edge" : ""}" x1="${from.x + xOffset}" y1="${from.y}" x2="${to.x + xOffset}" y2="${to.y}" marker-end="url(#arrowHead)" />`;
    }).join("");
    const nodes = data.nodes.map(n => `<g class="node ${n.active ? "current" : ""}" transform="translate(${n.x + xOffset}, ${n.y})"><circle r="23"></circle><text>${escapeHtml(n.label)}</text></g>`).join("");
    return edges + nodes;
  }
  visualCanvas.innerHTML = `<svg class="svg-stage" viewBox="0 0 800 400"><defs><marker id="arrowHead" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L0,6 L9,3 z" fill="#6f86a8"></path></marker></defs><text x="120" y="28" class="forest-title">原树 / 森林</text><text x="500" y="28" class="forest-title">孩子兄弟二叉树</text>${part(left, 0)}${part(right, 390)}</svg><div class="graph-note">${escapeHtml(state.note || "规则：左指针指向第一个孩子，右指针指向下一个兄弟。")}</div>`;
}

function heapState(arr, extra = {}) { return { kind: "heap", arr: clone(arr), ...extra }; }
function multiwayState(nodes, edges = [], extra = {}) { return { kind: "multiway", nodes: clone(nodes), edges: clone(edges), ...extra }; }

function buildShellSteps() {
  const steps = [];
  const a = [49, 38, 65, 97, 76, 13, 27, 50];
  addStep(steps, 1, "希尔排序先取较大的 gap，把相隔 gap 的元素分成若干子序列。", baseArrayState(a, { markers: ["初始序列", "gap = n / 2"] }));
  for (let gap = Math.floor(a.length / 2); gap >= 1; gap = Math.floor(gap / 2)) {
    addStep(steps, 1, `本轮 gap = ${gap}，对每组子序列做直接插入排序。`, baseArrayState(a, { markers: [`gap=${gap}`] }));
    for (let i = gap; i < a.length; i++) {
      const temp = a[i];
      let j = i - gap;
      addStep(steps, 2, `取 A[${i}]=${temp}，向前和 A[${j}]、A[${j-gap}]... 比较。`, baseArrayState(a, { compare: [i, j], markers: [`i=${i}`, `temp=${temp}`] }));
      while (j >= 0 && a[j] > temp) {
        addStep(steps, [4, 5], `${a[j]} > ${temp}，把 A[${j}] 后移到 A[${j + gap}]。`, baseArrayState(a, { active: [j, j + gap], markers: [`j=${j}`, "后移"] }));
        a[j + gap] = a[j];
        j -= gap;
        addStep(steps, 5, `j 减 gap，继续向前寻找插入位置。`, baseArrayState(a, { active: [Math.max(j, 0)], markers: [`j=${j}`] }));
      }
      a[j + gap] = temp;
      addStep(steps, 6, `把 temp=${temp} 放到 A[${j + gap}]。`, baseArrayState(a, { active: [j + gap], markers: [`插入位置=${j + gap}`] }));
    }
    if (gap === 1) break;
  }
  addStep(steps, 8, "gap=1 完成后，整个序列有序。", baseArrayState(a, { sorted: a.map((_, i) => i), markers: ["排序完成"] }), fmtArray(a));
  return steps;
}

function siftDownDemo(a, start, end, steps) {
  let root = start;
  while (2 * root + 1 <= end) {
    let child = 2 * root + 1;
    let swapIdx = root;
    addStep(steps, 3, `比较父结点 A[${root}]=${a[root]} 与左孩子 A[${child}]=${a[child]}。`, heapState(a, { active: [root, child], note: "大根堆要求：父结点 ≥ 左右孩子。" }));
    if (a[swapIdx] < a[child]) swapIdx = child;
    if (child + 1 <= end) {
      addStep(steps, 4, `再比较右孩子 A[${child + 1}]=${a[child + 1]}，选择较大的孩子。`, heapState(a, { active: [root, child, child + 1], note: `当前较大位置：${swapIdx}` }));
      if (a[swapIdx] < a[child + 1]) swapIdx = child + 1;
    }
    if (swapIdx === root) {
      addStep(steps, 6, `A[${root}] 已经不小于孩子，调整结束。`, heapState(a, { active: [root], note: "该子树已满足大根堆性质。" }));
      return;
    }
    addStep(steps, 7, `交换 A[${root}] 与较大的孩子 A[${swapIdx}]，让大元素上浮。`, heapState(a, { swap: [root, swapIdx], note: "交换后继续向下调整。" }));
    [a[root], a[swapIdx]] = [a[swapIdx], a[root]];
    root = swapIdx;
    addStep(steps, 8, `root 下移到 ${root}，继续筛选。`, heapState(a, { active: [root], note: fmtArray(a) }));
  }
}

function buildHeapSortSteps() {
  const steps = [];
  const a = [53, 17, 78, 9, 45, 65, 87];
  addStep(steps, 0, "堆排序先把无序数组看成完全二叉树的顺序存储。", heapState(a, { note: "数组下标 i 的左孩子是 2i+1，右孩子是 2i+2。" }));
  for (let i = Math.floor(a.length / 2) - 1; i >= 0; i--) {
    addStep(steps, 1, `从最后一个非叶子结点 i=${i} 开始向下调整。`, heapState(a, { active: [i], note: "建堆从 n/2-1 到 0。" }));
    siftDownDemo(a, i, a.length - 1, steps);
  }
  addStep(steps, 2, "大根堆建立完成，堆顶是当前最大值。", heapState(a, { active: [0], note: "每趟把堆顶最大值放到末尾。" }));
  const sorted = [];
  for (let end = a.length - 1; end > 0; end--) {
    addStep(steps, 10, `交换堆顶 A[0]=${a[0]} 和堆尾 A[${end}]=${a[end]}。`, heapState(a, { swap: [0, end], sorted, note: `最大值将归位到 A[${end}]。` }));
    [a[0], a[end]] = [a[end], a[0]];
    sorted.push(end);
    addStep(steps, 11, `A[${end}] 已有序，对剩余 A[0..${end - 1}] 继续调整成大根堆。`, heapState(a, { active: [0], sorted, note: fmtArray(a) }));
    siftDownDemo(a, 0, end - 1, steps);
  }
  sorted.push(0);
  addStep(steps, 12, "堆排序完成。", heapState(a, { sorted, note: "堆排序不稳定，空间复杂度 O(1)。" }), fmtArray(a));
  return steps;
}

function buildSeqSearchSteps() {
  const steps = [];
  const a = [34, 12, 78, 45, 23, 89, 56];
  const key = 23;
  addStep(steps, 0, `顺序查找从第一个元素开始，一个一个比较 key=${key}。`, baseArrayState(a, { markers: [`key=${key}`] }));
  for (let i = 0; i < a.length; i++) {
    addStep(steps, 1, `比较 A[${i}]=${a[i]} 与 key=${key}。`, baseArrayState(a, { compare: [i], markers: [`i=${i}`] }));
    if (a[i] === key) {
      addStep(steps, 2, `找到 key，返回下标 ${i}。`, baseArrayState(a, { active: [i], sorted: [i], markers: ["查找成功"] }), `pos = ${i}`);
      return steps;
    }
  }
  addStep(steps, 4, "扫描完整个表仍未找到，返回 -1。", baseArrayState(a, { markers: ["查找失败"] }), "pos = -1");
  return steps;
}

function buildBinarySearchSteps() {
  const steps = [];
  const a = [5, 13, 19, 27, 38, 49, 65, 76, 88];
  const key = 49;
  let low = 0, high = a.length - 1;
  addStep(steps, 0, "折半查找只能用于有序顺序表。", baseArrayState(a, { window: a.map((_, i) => i), markers: [`key=${key}`, `low=${low}`, `high=${high}`] }));
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const window = [];
    for (let i = low; i <= high; i++) window.push(i);
    addStep(steps, 1, `计算 mid=(low+high)/2=${mid}。`, baseArrayState(a, { window, active: [mid], markers: [`low=${low}`, `mid=${mid}`, `high=${high}`] }));
    addStep(steps, 2, `比较 A[${mid}]=${a[mid]} 与 key=${key}。`, baseArrayState(a, { window, compare: [mid], markers: [`A[mid]=${a[mid]}`] }));
    if (a[mid] === key) {
      addStep(steps, 3, `A[mid] 等于 key，查找成功。`, baseArrayState(a, { active: [mid], sorted: [mid], markers: ["查找成功"] }), `pos = ${mid}`);
      return steps;
    }
    if (a[mid] < key) {
      low = mid + 1;
      addStep(steps, 4, `A[mid] < key，说明目标在右半区，low=mid+1=${low}。`, baseArrayState(a, { active: [mid], window: Array.from({ length: high - low + 1 }, (_, k) => low + k), markers: [`low=${low}`, `high=${high}`] }));
    } else {
      high = mid - 1;
      addStep(steps, 5, `A[mid] > key，说明目标在左半区，high=mid-1=${high}。`, baseArrayState(a, { active: [mid], window: Array.from({ length: high - low + 1 }, (_, k) => low + k), markers: [`low=${low}`, `high=${high}`] }));
    }
  }
  addStep(steps, 7, "low > high，查找失败。", baseArrayState(a, { markers: ["查找失败"] }), "pos = -1");
  return steps;
}

function buildBlockSearchSteps() {
  const steps = [];
  const a = [8, 14, 20, 28, 34, 42, 50, 59, 66, 72, 81, 90];
  const blocks = [{ name: 1, l: 0, r: 3, max: 28 }, { name: 2, l: 4, r: 7, max: 59 }, { name: 3, l: 8, r: 11, max: 90 }];
  const key = 50;
  addStep(steps, 0, "分块查找先看索引表：每块有最大关键字和块范围。", baseArrayState(a, { blocks, markers: [`key=${key}`] }));
  for (const b of blocks) {
    addStep(steps, 1, `比较 key=${key} 与块${b.name}的最大值 ${b.max}。`, baseArrayState(a, { blocks, window: Array.from({ length: b.r - b.l + 1 }, (_, k) => b.l + k), markers: [`块${b.name}`, `max=${b.max}`] }));
    if (key <= b.max) {
      addStep(steps, 2, `key <= ${b.max}，目标只可能在块${b.name}内。`, baseArrayState(a, { blocks, window: Array.from({ length: b.r - b.l + 1 }, (_, k) => b.l + k), markers: [`顺序查找 A[${b.l}..${b.r}]`] }));
      for (let i = b.l; i <= b.r; i++) {
        addStep(steps, 3, `块内顺序查找：比较 A[${i}]=${a[i]}。`, baseArrayState(a, { blocks, compare: [i], window: Array.from({ length: b.r - b.l + 1 }, (_, k) => b.l + k), markers: [`i=${i}`] }));
        if (a[i] === key) {
          addStep(steps, 4, `找到 key，返回下标 ${i}。`, baseArrayState(a, { blocks, active: [i], sorted: [i], markers: ["查找成功"] }), `pos = ${i}`);
          return steps;
        }
      }
    }
  }
  return steps;
}

const COMPLETE_NODES = [
  { id: "0", label: "A", x: 400, y: 45 }, { id: "1", label: "B", x: 240, y: 125 }, { id: "2", label: "C", x: 560, y: 125 },
  { id: "3", label: "D", x: 150, y: 225 }, { id: "4", label: "E", x: 330, y: 225 }, { id: "5", label: "F", x: 490, y: 225 }, { id: "6", label: "G", x: 650, y: 225 },
  { id: "7", label: "H", x: 105, y: 320 }, { id: "8", label: "I", x: 195, y: 320 }
];
const COMPLETE_EDGES = [["0", "1"], ["0", "2"], ["1", "3"], ["1", "4"], ["2", "5"], ["2", "6"], ["3", "7"], ["3", "8"]];

function buildBinaryTreeCreateSteps() {
  const steps = [];
  const nodes = COMPLETE_NODES.slice(0, 7);
  const edges = COMPLETE_EDGES.slice(0, 6);
  addStep(steps, 0, "普通二叉树每个结点最多两个孩子，但不要求有序。", { kind: "tree", nodes: nodes.slice(0, 1), edges: [], current: ["0"], note: "先创建根结点 A。" });
  for (let i = 1; i < nodes.length; i++) {
    addStep(steps, 3, `创建结点 ${nodes[i].label}，挂到对应父结点的左/右孩子位置。`, { kind: "tree", nodes: nodes.slice(0, i + 1), edges: edges.filter(e => Number(e[1]) <= i), insert: [String(i)], note: "普通二叉树不按大小排序，结构由题目或输入决定。" });
  }
  addStep(steps, 6, "二叉树创建完成，可继续做先序/中序/后序/层序遍历。", { kind: "tree", nodes, edges, visited: nodes.map(n => n.id), note: "408 常考：遍历序列、线索二叉树、结点数与高度关系。" });
  return steps;
}

function buildCompleteTreeSteps() {
  const steps = [];
  const nodes = COMPLETE_NODES;
  const edges = COMPLETE_EDGES;
  addStep(steps, 0, "完全二叉树除最后一层外都满，最后一层从左到右连续。", { kind: "tree", nodes: nodes.slice(0, 7), edges: edges.slice(0, 6), note: "这是满的前三层。" });
  addStep(steps, 1, "继续插入 H，必须放在最后一层最左边的位置。", { kind: "tree", nodes: nodes.slice(0, 8), edges: edges.slice(0, 7), insert: ["7"], note: "不能跳过左边位置去插右边。" });
  addStep(steps, 2, "插入 I，仍然从左到右填充。", { kind: "tree", nodes, edges, insert: ["8"], note: "完全二叉树适合顺序存储。" });
  addStep(steps, 3, "顺序存储下：下标 i 的左孩子 2i+1，右孩子 2i+2，父结点 floor((i-1)/2)。", { kind: "tree", nodes, edges, current: ["3"], target: ["7", "8"], activeEdges: [["3", "7"], ["3", "8"]], note: "例如 D 的下标是 3，左孩子 H 是 7，右孩子 I 是 8。" }, "A B C D E F G H I");
  return steps;
}

const BST_DELETE_BEFORE_NODES = [
  { id: "50", label: "50", x: 400, y: 50 }, { id: "30", label: "30", x: 240, y: 135 }, { id: "70", label: "70", x: 560, y: 135 },
  { id: "20", label: "20", x: 145, y: 230 }, { id: "40", label: "40", x: 335, y: 230 }, { id: "60", label: "60", x: 500, y: 230 }, { id: "80", label: "80", x: 650, y: 230 },
  { id: "35", label: "35", x: 300, y: 325 }, { id: "45", label: "45", x: 370, y: 325 }
];
const BST_DELETE_BEFORE_EDGES = [["50", "30"], ["50", "70"], ["30", "20"], ["30", "40"], ["70", "60"], ["70", "80"], ["40", "35"], ["40", "45"]];

function buildBstDeleteSteps() {
  const steps = [];
  addStep(steps, 0, "删除 BST 中的 30：先按查找路径定位要删除的结点。", { kind: "tree", nodes: BST_DELETE_BEFORE_NODES, edges: BST_DELETE_BEFORE_EDGES, current: ["50"], note: "30 < 50，向左找。" });
  addStep(steps, 1, "找到结点 30，它有两个孩子，不能直接删除。", { kind: "tree", nodes: BST_DELETE_BEFORE_NODES, edges: BST_DELETE_BEFORE_EDGES, target: ["30"], note: "两个孩子：通常用中序前驱或中序后继替代。" });
  addStep(steps, 4, "选择中序后继：右子树中最小的结点是 35。", { kind: "tree", nodes: BST_DELETE_BEFORE_NODES, edges: BST_DELETE_BEFORE_EDGES, current: ["40"], target: ["35"], activeEdges: [["30", "40"], ["40", "35"]], note: "后继结点一定没有左孩子。" });
  const nodes2 = BST_DELETE_BEFORE_NODES.map(n => n.id === "30" ? { ...n, id: "35R", label: "35" } : n).filter(n => n.id !== "35");
  const edges2 = [["50", "35R"], ["50", "70"], ["35R", "20"], ["35R", "40"], ["70", "60"], ["70", "80"], ["40", "45"]];
  addStep(steps, 5, "用 35 覆盖 30，再删除原来的后继结点 35。", { kind: "tree", nodes: nodes2, edges: edges2, insert: ["35R"], note: "BST 的中序序列仍然保持递增。" });
  addStep(steps, 7, "删除完成。", { kind: "tree", nodes: nodes2, edges: edges2, visited: nodes2.map(n => n.id), note: "考点：叶子结点、单分支结点、双分支结点三种删除情况。" });
  return steps;
}

function buildTreeUpdateSteps() {
  const steps = [];
  addStep(steps, 0, "在二叉排序树中“修改关键字”会破坏有序性，不能只改 data。", { kind: "tree", nodes: TREE_BASE_NODES, edges: TREE_BASE_EDGES, target: ["40"], note: "例如把 40 改成 65，会落在错误位置。" });
  addStep(steps, 1, "正确做法：先查找旧关键字 40。", { kind: "tree", nodes: TREE_BASE_NODES, edges: TREE_BASE_EDGES, current: ["50", "30", "40"], activeEdges: [["50", "30"], ["30", "40"]], note: "定位旧结点。" });
  const nodesNo40 = TREE_BASE_NODES.filter(n => n.id !== "40");
  const edgesNo40 = TREE_BASE_EDGES.filter(e => e[1] !== "40");
  addStep(steps, 2, "删除旧关键字 40。", { kind: "tree", nodes: nodesNo40, edges: edgesNo40, note: "删除后树仍保持 BST 性质。" });
  addStep(steps, 3, "再按新关键字 65 重新插入。", { kind: "tree", nodes: TREE_WITH_65_NODES, edges: TREE_WITH_65_EDGES, insert: ["65"], activeEdges: [["50", "70"], ["70", "60"], ["60", "65"]], note: "修改 = 删除旧值 + 插入新值。" });
  return steps;
}

function buildAvlInsertSteps() {
  const steps = [];
  const n10 = [{ id: "10", label: "10", x: 400, y: 70 }];
  const n1020 = [{ id: "10", label: "10", x: 360, y: 70 }, { id: "20", label: "20", x: 470, y: 160 }];
  const e1020 = [["10", "20"]];
  const nUn = [{ id: "10", label: "10", x: 310, y: 70 }, { id: "20", label: "20", x: 440, y: 160 }, { id: "30", label: "30", x: 560, y: 250 }];
  const eUn = [["10", "20"], ["20", "30"]];
  const nRot = [{ id: "20", label: "20", x: 400, y: 70 }, { id: "10", label: "10", x: 285, y: 170 }, { id: "30", label: "30", x: 515, y: 170 }];
  const eRot = [["20", "10"], ["20", "30"]];
  addStep(steps, 0, "插入 10，AVL 树仍平衡。", { kind: "tree", nodes: n10, edges: [], insert: ["10"], note: "AVL 任一结点左右子树高度差不超过 1。" });
  addStep(steps, 1, "插入 20，成为 10 的右孩子。", { kind: "tree", nodes: n1020, edges: e1020, insert: ["20"], note: "平衡因子 BF(10)= -1，仍平衡。" });
  addStep(steps, 2, "插入 30，出现 RR 型失衡：10 的右孩子的右子树过高。", { kind: "tree", nodes: nUn, edges: eUn, insert: ["30"], danger: ["10"], note: "BF(10)= -2，需要左旋。" });
  addStep(steps, 5, "对 10 做一次左旋：20 上升为根，10 成为 20 的左孩子。", { kind: "tree", nodes: nRot, edges: eRot, current: ["20"], note: "RR 型：左旋；LL 型：右旋；LR/RL 型：先局部再整体双旋。" });
  addStep(steps, 6, "旋转后中序序列仍是 10,20,30，且高度重新平衡。", { kind: "tree", nodes: nRot, edges: eRot, visited: ["10", "20", "30"], note: "AVL 旋转不改变二叉排序树的中序有序性。" });
  return steps;
}

function buildBtreeSearchSteps() {
  const steps = [];
  const nodes = [
    { id: "r", keys: [30, 60], x: 400, y: 65 },
    { id: "l", keys: [10, 20], x: 190, y: 190, leaf: true },
    { id: "m", keys: [40, 50], x: 400, y: 190, leaf: true },
    { id: "r2", keys: [70, 80], x: 610, y: 190, leaf: true }
  ];
  const edges = [["r", "l"], ["r", "m"], ["r", "r2"]];
  addStep(steps, 0, "B 树查找：在结点内顺序/折半比较关键字。查找 50。", multiwayState(nodes, edges, { active: ["r"], note: "根结点关键字：[30 | 60]。" }));
  addStep(steps, 1, "50 > 30 且 50 < 60，进入中间孩子。", multiwayState(nodes, edges, { active: ["r", "m"], note: "根据关键字范围选择孩子指针。" }));
  addStep(steps, 2, "在叶结点 [40 | 50] 中找到 50。", multiwayState(nodes, edges, { active: ["m"], leaf: ["m"], note: "B 树的数据记录可存放在每个结点中。" }), "查找成功");
  return steps;
}

function buildBtreeInsertSteps() {
  const steps = [];
  addStep(steps, 0, "以 3 阶 B 树演示：每个结点最多 2 个关键字。先有 [10 | 20]。", multiwayState([{ id: "a", keys: [10, 20], x: 400, y: 120, leaf: true }], [], { active: ["a"], note: "插入 30 会使结点临时溢出。" }));
  addStep(steps, 1, "把 30 插入叶结点，得到临时 [10 | 20 | 30]，超过最大关键字数。", multiwayState([{ id: "a", keys: [10, 20, 30], x: 400, y: 120, leaf: true }], [], { split: ["a"], note: "需要分裂，中间关键字上升。" }));
  const nodes = [{ id: "r", keys: [20], x: 400, y: 70 }, { id: "l", keys: [10], x: 270, y: 200, leaf: true }, { id: "rr", keys: [30], x: 530, y: 200, leaf: true }];
  addStep(steps, 2, "中间关键字 20 上升为根，左边 [10]，右边 [30]。", multiwayState(nodes, [["r", "l"], ["r", "rr"]], { active: ["r"], note: "B 树插入总是在叶子，溢出就分裂并向上推广。" }));
  addStep(steps, 3, "插入完成，所有叶子仍在同一层。", multiwayState(nodes, [["r", "l"], ["r", "rr"]], { leaf: ["l", "rr"], note: "B 树核心性质：多路、平衡、所有叶子等高。" }));
  return steps;
}

function buildBtreeDeleteSteps() {
  const steps = [];
  const nodes = [
    { id: "r", keys: [40], x: 400, y: 65 },
    { id: "l", keys: [10, 20], x: 230, y: 190, leaf: true },
    { id: "m", keys: [50], x: 570, y: 190, leaf: true }
  ];
  const edges = [["r", "l"], ["r", "m"]];
  addStep(steps, 0, "删除叶结点中的 50。", multiwayState(nodes, edges, { active: ["m"], note: "假设该阶 B 树非根结点至少 1 个关键字。" }));
  addStep(steps, 1, "删除后右孩子变空，低于最少关键字数，发生下溢。", multiwayState([{ ...nodes[0] }, nodes[1], { id: "m", keys: [], x: 570, y: 190, leaf: true }], edges, { split: ["m"], note: "下溢时先考虑向兄弟借关键字。" }));
  addStep(steps, 2, "左兄弟 [10 | 20] 有多余关键字：父关键字 40 下移，兄弟最大 20 上移。", multiwayState([{ id: "r", keys: [20], x: 400, y: 65 }, { id: "l", keys: [10], x: 230, y: 190, leaf: true }, { id: "m", keys: [40], x: 570, y: 190, leaf: true }], edges, { active: ["r", "l", "m"], note: "借位后仍保持关键字范围有序。" }));
  addStep(steps, 3, "若兄弟也不够借，则要与兄弟和父关键字合并。", multiwayState([{ id: "r", keys: [20], x: 400, y: 65 }, { id: "l", keys: [10], x: 230, y: 190, leaf: true }, { id: "m", keys: [40], x: 570, y: 190, leaf: true }], edges, { note: "408 常考删除处理顺序：借位优先，不能借再合并。" }));
  return steps;
}

function buildBplusSearchSteps() {
  const steps = [];
  const nodes = [
    { id: "r", keys: [30, 60], x: 400, y: 65 },
    { id: "l", keys: [10, 20], x: 180, y: 190, leaf: true },
    { id: "m", keys: [30, 40, 50], x: 400, y: 190, leaf: true },
    { id: "rr", keys: [60, 70, 80], x: 630, y: 190, leaf: true }
  ];
  const edges = [["r", "l"], ["r", "m"], ["r", "rr"]];
  addStep(steps, 0, "B+ 树内部结点只起索引作用，所有数据关键字都在叶子层。查找区间 [35,70]。", multiwayState(nodes, edges, { leafLinks: [["l", "m"], ["m", "rr"]], active: ["r"], note: "先用索引定位到起始叶子。" }));
  addStep(steps, 1, "35 介于 30 和 60 之间，进入中间叶子。", multiwayState(nodes, edges, { leafLinks: [["l", "m"], ["m", "rr"]], active: ["m"], leaf: ["m"], note: "在叶子 [30 | 40 | 50] 中找到第一个 >=35 的关键字 40。" }));
  addStep(steps, 2, "沿叶子链表向右顺序扫描，得到 40、50、60、70。", multiwayState(nodes, edges, { leafLinks: [["l", "m"], ["m", "rr"]], active: ["m", "rr"], leaf: ["m", "rr"], note: "范围查询是 B+ 树优势。" }), "40, 50, 60, 70");
  return steps;
}

function buildBplusInsertSteps() {
  const steps = [];
  const before = [{ id: "r", keys: [30], x: 400, y: 65 }, { id: "l", keys: [10, 20], x: 250, y: 190, leaf: true }, { id: "rr", keys: [30, 40], x: 550, y: 190, leaf: true }];
  addStep(steps, 0, "向 B+ 树插入 50，先定位到叶子 [30 | 40]。", multiwayState(before, [["r", "l"], ["r", "rr"]], { leafLinks: [["l", "rr"]], active: ["rr"], note: "B+ 树插入一定落到叶子层。" }));
  addStep(steps, 1, "叶子临时变成 [30 | 40 | 50]，超过容量，需要分裂。", multiwayState([{ id: "r", keys: [30], x: 400, y: 65 }, { id: "l", keys: [10, 20], x: 220, y: 190, leaf: true }, { id: "rr", keys: [30, 40, 50], x: 560, y: 190, leaf: true }], [["r", "l"], ["r", "rr"]], { split: ["rr"], leafLinks: [["l", "rr"]], note: "B+ 树分裂后要维护叶子链。" }));
  const after = [{ id: "r", keys: [30, 50], x: 400, y: 65 }, { id: "l", keys: [10, 20], x: 170, y: 190, leaf: true }, { id: "m", keys: [30, 40], x: 400, y: 190, leaf: true }, { id: "rr", keys: [50], x: 630, y: 190, leaf: true }];
  addStep(steps, 2, "叶子分裂为 [30 | 40] 和 [50]，新叶子的最小关键字 50 复制到父索引。", multiwayState(after, [["r", "l"], ["r", "m"], ["r", "rr"]], { leafLinks: [["l", "m"], ["m", "rr"]], active: ["r", "rr"], note: "注意：B+ 树是复制到父结点，数据仍在叶子。" }));
  return steps;
}

function buildRbInsertSteps() {
  const steps = [];
  const s1 = [{ id: "10", label: "10", x: 400, y: 70, color: "black" }];
  const s2 = [{ id: "10", label: "10", x: 400, y: 70, color: "black" }, { id: "5", label: "5", x: 290, y: 170, color: "red" }, { id: "15", label: "15", x: 510, y: 170, color: "red" }];
  const e2 = [["10", "5"], ["10", "15"]];
  const s3 = [...s2, { id: "1", label: "1", x: 210, y: 270, color: "red" }];
  const e3 = [...e2, ["5", "1"]];
  const s4 = [{ id: "10", label: "10", x: 400, y: 70, color: "red" }, { id: "5", label: "5", x: 290, y: 170, color: "black" }, { id: "15", label: "15", x: 510, y: 170, color: "black" }, { id: "1", label: "1", x: 210, y: 270, color: "red" }];
  const s5 = s4.map(n => n.id === "10" ? { ...n, color: "black" } : n);
  addStep(steps, 0, "红黑树插入新结点时，默认把新结点染成红色。根结点必须是黑色。", { kind: "tree", nodes: s1, edges: [], current: ["10"], note: "红黑树本质是近似平衡的二叉排序树。" });
  addStep(steps, 1, "插入 5 和 15，它们是红色，父结点 10 是黑色，不冲突。", { kind: "tree", nodes: s2, edges: e2, insert: ["5", "15"], note: "红结点不能有红孩子。" });
  addStep(steps, 2, "插入 1，父结点 5 是红色，出现“红红冲突”。", { kind: "tree", nodes: s3, edges: e3, danger: ["5", "1"], note: "查看叔叔结点 15，也是红色。" });
  addStep(steps, 3, "父红、叔红：父和叔染黑，祖父染红。", { kind: "tree", nodes: s4, edges: e3, current: ["10", "5", "15"], note: "这是插入修正中最常见的重染色情况。" });
  addStep(steps, 4, "最后根结点重新染黑。", { kind: "tree", nodes: s5, edges: e3, visited: ["10", "5", "15", "1"], note: "若叔叔是黑色，则通常需要旋转 + 重染色。" });
  return steps;
}

function buildForestConvertSteps() {
  const steps = [];
  const forest = {
    nodes: [
      { id: "A", label: "A", x: 135, y: 70 }, { id: "B", label: "B", x: 70, y: 160 }, { id: "C", label: "C", x: 135, y: 160 }, { id: "D", label: "D", x: 200, y: 160 },
      { id: "E", label: "E", x: 300, y: 70 }, { id: "F", label: "F", x: 270, y: 160 }, { id: "G", label: "G", x: 330, y: 160 }
    ],
    edges: [["A", "B"], ["A", "C"], ["A", "D"], ["E", "F"], ["E", "G"]]
  };
  const binary1 = { nodes: [{ id: "A", label: "A", x: 90, y: 70 }, { id: "B", label: "B", x: 70, y: 155 }, { id: "C", label: "C", x: 150, y: 155 }, { id: "D", label: "D", x: 230, y: 155 }], edges: [{ from: "A", to: "B", kind: "child" }, { from: "B", to: "C", kind: "sibling" }, { from: "C", to: "D", kind: "sibling" }] };
  const binary2 = { nodes: [{ id: "A", label: "A", x: 80, y: 70 }, { id: "B", label: "B", x: 60, y: 155 }, { id: "C", label: "C", x: 140, y: 155 }, { id: "D", label: "D", x: 220, y: 155 }, { id: "E", label: "E", x: 300, y: 70 }, { id: "F", label: "F", x: 280, y: 155 }, { id: "G", label: "G", x: 360, y: 155 }], edges: [{ from: "A", to: "B", kind: "child" }, { from: "B", to: "C", kind: "sibling" }, { from: "C", to: "D", kind: "sibling" }, { from: "A", to: "E", kind: "sibling" }, { from: "E", to: "F", kind: "child" }, { from: "F", to: "G", kind: "sibling" }] };
  addStep(steps, 0, "森林转二叉树：每棵树内部先按“左孩子右兄弟”转换。", { kind: "forest", left: forest, right: { nodes: [], edges: [] }, note: "左边是森林：A 有 B/C/D 三个孩子，E 有 F/G 两个孩子。" });
  addStep(steps, 1, "对第一棵树：A 的第一个孩子 B 变成左孩子；B 的兄弟 C、D 串在右指针上。", { kind: "forest", left: forest, right: binary1, note: "左指针=第一个孩子；右指针=下一个兄弟。" });
  addStep(steps, 2, "森林中各棵树的根也按兄弟关系相连：A 的右指针指向 E。", { kind: "forest", left: forest, right: binary2, note: "森林根结点之间也看成兄弟链。" });
  addStep(steps, 3, "二叉树还原成森林时：沿根的右指针切开，左指针还原为孩子，右指针还原为兄弟。", { kind: "forest", left: forest, right: binary2, note: "408 常考画法：兄弟连右线，父子保留左线。" });
  return steps;
}

function buildDirectedGraphSteps() {
  const steps = [];
  const nodes = DAG_NODES;
  const edges = DAG_EDGES;
  const indegree = { A: 0, B: 1, C: 1, D: 2, E: 1, F: 2 };
  const outdegree = { A: 2, B: 1, C: 2, D: 1, E: 1, F: 0 };
  addStep(steps, 0, "有向图的边有方向：A→B 表示只能从 A 沿这条边到 B。", { kind: "graph", nodes, edges, directed: true, activeEdges: [{ from: "A", to: "B" }], note: "箭头方向就是邻接表中的出边方向。" });
  addStep(steps, 1, "统计入度和出度：入度看有多少边指向该点，出度看从该点出去多少边。", { kind: "graph", nodes, edges, directed: true, indegree, outdegree, current: ["D"], note: "D 的入度为 2：B→D、C→D。" });
  addStep(steps, 2, "DAG 是有向无环图，可以做拓扑排序。", { kind: "graph", nodes, edges, directed: true, target: ["A"], indegree, note: "入度为 0 的顶点可作为拓扑序列起点。" });
  return steps;
}

function buildUndirectedGraphSteps() {
  const steps = [];
  const nodes = GRAPH_NODES;
  const edges = [{ from: "A", to: "B" }, { from: "A", to: "C" }, { from: "B", to: "D" }, { from: "C", to: "E" }, { from: "D", to: "F" }, { from: "E", to: "F" }];
  addStep(steps, 0, "无向图的边没有箭头，A—B 表示 A 可到 B，B 也可到 A。", { kind: "graph", nodes, edges, directed: false, activeEdges: [{ from: "A", to: "B" }], note: "无向边在邻接表中通常存两次：A 的表里有 B，B 的表里有 A。" });
  addStep(steps, 1, "从 A 访问相邻点 B、C。", { kind: "graph", nodes, edges, directed: false, visited: ["A"], current: ["B", "C"], activeEdges: [{ from: "A", to: "B" }, { from: "A", to: "C" }], note: "BFS 用队列，DFS 用栈/递归。" });
  addStep(steps, 2, "无向图常考连通分量、生成树、最小生成树。", { kind: "graph", nodes, edges, directed: false, visited: ["A", "B", "C", "D", "E", "F"], note: "遍历一次只能走完一个连通分量。" });
  return steps;
}

function buildReverseTopoSteps() {
  const steps = [];
  const nodes = DAG_NODES;
  const edges = DAG_EDGES;
  const visited = new Set();
  const output = [];
  function dfs(u, stack) {
    visited.add(u);
    addStep(steps, 1, `DFS 访问 ${u}。`, { kind: "graph", nodes, edges, directed: true, visited: [...visited], current: [u], stack: stack.concat(u), output: [...output] });
    for (const e of edges.filter(e => e.from === u)) {
      addStep(steps, 2, `检查边 ${e.from}→${e.to}。`, { kind: "graph", nodes, edges, directed: true, visited: [...visited], current: [u], activeEdges: [e], stack: stack.concat(u), output: [...output] });
      if (!visited.has(e.to)) dfs(e.to, stack.concat(u));
    }
    output.push(u);
    addStep(steps, 4, `${u} 的所有后继都处理完，把 ${u} 加入逆拓扑序列。`, { kind: "graph", nodes, edges, directed: true, visited: [...visited], current: [u], output: [...output] });
  }
  addStep(steps, 0, "逆拓扑排序：DFS 后序输出，先输出没有后继的点。", { kind: "graph", nodes, edges, directed: true, note: "适用于 DAG。" });
  dfs("A", []);
  addStep(steps, 6, "输出完成。若把逆拓扑序列再反过来，就是一个拓扑序列。", { kind: "graph", nodes, edges, directed: true, visited: [...visited], output: [...output] }, output.join(" → "));
  return steps;
}

function buildInfixToPostfixSteps() {
  const steps = [];
  const tokens = ["A", "+", "B", "*", "C", "-", "(", "D", "/", "E", ")"];
  const prec = { "+": 1, "-": 1, "*": 2, "/": 2 };
  const output = [];
  const ops = [];
  addStep(steps, 0, "中缀转后缀：操作数直接输出，运算符借助运算符栈处理优先级。", { kind: "expression", tokens, index: -1, opStack: ops, output, note: "示例：A+B*C-(D/E)" });
  tokens.forEach((t, i) => {
    if (/^[A-Z]$/.test(t)) {
      output.push(t);
      addStep(steps, 2, `读到操作数 ${t}，直接加入输出序列。`, { kind: "expression", tokens, index: i, opStack: [...ops], output: [...output], note: "操作数不进运算符栈。" });
    } else if (t === "(") {
      ops.push(t);
      addStep(steps, 4, "读到左括号，直接入运算符栈。", { kind: "expression", tokens, index: i, opStack: [...ops], output: [...output], note: "左括号用于阻断括号内外的优先级比较。" });
    } else if (t === ")") {
      addStep(steps, 6, "读到右括号，弹出运算符直到遇到左括号。", { kind: "expression", tokens, index: i, opStack: [...ops], output: [...output] });
      while (ops.length && ops[ops.length - 1] !== "(") output.push(ops.pop());
      ops.pop();
      addStep(steps, 7, "括号内运算符已经输出，弹出左括号但不输出。", { kind: "expression", tokens, index: i, opStack: [...ops], output: [...output] });
    } else {
      addStep(steps, 9, `读到运算符 ${t}，与栈顶运算符比较优先级。`, { kind: "expression", tokens, index: i, opStack: [...ops], output: [...output], note: "栈顶优先级 >= 当前运算符时，先弹出栈顶。" });
      while (ops.length && ops[ops.length - 1] !== "(" && prec[ops[ops.length - 1]] >= prec[t]) {
        output.push(ops.pop());
        addStep(steps, 10, "弹出栈顶高/同优先级运算符到输出序列。", { kind: "expression", tokens, index: i, opStack: [...ops], output: [...output] });
      }
      ops.push(t);
      addStep(steps, 11, `当前运算符 ${t} 入栈。`, { kind: "expression", tokens, index: i, opStack: [...ops], output: [...output] });
    }
  });
  while (ops.length) {
    output.push(ops.pop());
    addStep(steps, 14, "扫描结束，依次弹出剩余运算符。", { kind: "expression", tokens, index: tokens.length, opStack: [...ops], output: [...output] });
  }
  addStep(steps, 15, "得到后缀表达式。", { kind: "expression", tokens, index: tokens.length, opStack: [], output: [...output], note: "后缀表达式不需要括号，适合用操作数栈求值。" }, output.join(" "));
  return steps;
}

function exprTreeState(stage) {
  const trees = {
    leafA: { nodes: [{ id: "A", label: "A", x: 180, y: 170 }], edges: [] },
    mul: { nodes: [{ id: "*", label: "*", x: 240, y: 90, op: true }, { id: "B", label: "B", x: 185, y: 170 }, { id: "C", label: "C", x: 295, y: 170 }], edges: [["*", "B"], ["*", "C"]] },
    plus: { nodes: [{ id: "+", label: "+", x: 210, y: 55, op: true }, { id: "A", label: "A", x: 145, y: 140 }, { id: "*", label: "*", x: 275, y: 140, op: true }, { id: "B", label: "B", x: 235, y: 205 }, { id: "C", label: "C", x: 315, y: 205 }], edges: [["+", "A"], ["+", "*"], ["*", "B"], ["*", "C"]] }
  };
  return trees[stage];
}

function buildExprTreeConvertSteps() {
  const steps = [];
  const tokens = ["A", "B", "C", "*", "+"];
  addStep(steps, 0, "后缀表达式 A B C * + 可用操作数栈构造表达式树。", { kind: "expression", tokens, index: -1, valStack: [], note: "遇到操作数入栈，遇到运算符弹出两个子树。" });
  addStep(steps, 1, "读到 A，创建叶子结点并入栈。", { kind: "expression", tokens, index: 0, valStack: ["A"], tree: exprTreeState("leafA"), note: "操作数是叶子结点。" });
  addStep(steps, 1, "读到 B、C，分别创建叶子并入栈。", { kind: "expression", tokens, index: 2, valStack: ["A", "B", "C"], note: "栈顶从下到上：A, B, C。" });
  addStep(steps, 3, "读到 *，弹出 C 作为右孩子，弹出 B 作为左孩子，组成 B*C 子树。", { kind: "expression", tokens, index: 3, valStack: ["A", "(B*C)"], tree: exprTreeState("mul"), note: "注意弹出顺序：先弹出的是右操作数。" });
  addStep(steps, 3, "读到 +，弹出 (B*C) 和 A，组成 A+B*C 的表达式树。", { kind: "expression", tokens, index: 4, valStack: ["(A+B*C)"], tree: exprTreeState("plus"), note: "根是最后一个运算符。" });
  addStep(steps, 6, "对表达式树做遍历：先序得前缀，中序得中缀，后序得后缀。", { kind: "expression", tokens, index: 4, valStack: ["+ A * B C", "A + B * C", "A B C * +"], tree: exprTreeState("plus"), note: "画树法最适合理解三种表达式互转。" }, "前缀：+ A * B C；中缀：A + B * C；后缀：A B C * +");
  return steps;
}

Object.assign(DEMO_LIBRARY, {
  shell: {
    title: "希尔排序",
    category: "排序 / 插入类排序",
    code: [
      "void ShellSort(int A[], int n) {",
      "    for (int gap = n / 2; gap >= 1; gap /= 2) {",
      "        for (int i = gap; i < n; i++) {",
      "            int temp = A[i];",
      "            int j = i - gap;",
      "            while (j >= 0 && A[j] > temp) {",
      "                A[j + gap] = A[j];",
      "                j -= gap;",
      "            }",
      "            A[j + gap] = temp;",
      "        }",
      "    }",
      "}"
    ],
    examTips: sortingTips(["希尔排序是不稳定排序。", "时间复杂度与 gap 序列有关，408 通常掌握过程和不稳定性。"]),
    buildSteps: buildShellSteps,
  },
  heap_sort: {
    title: "堆排序",
    category: "排序 / 选择类排序",
    code: [
      "void HeapSort(int A[], int n) {",
      "    for (int i = n / 2 - 1; i >= 0; i--)",
      "        SiftDown(A, i, n - 1);",
      "    for (int end = n - 1; end > 0; end--) {",
      "        swap(A[0], A[end]);",
      "        SiftDown(A, 0, end - 1);",
      "    }",
      "}",
      "void SiftDown(int A[], int root, int end) {",
      "    while (2 * root + 1 <= end) {",
      "        int child = 2 * root + 1;",
      "        if (child + 1 <= end && A[child + 1] > A[child]) child++;",
      "        if (A[root] >= A[child]) break;",
      "        swap(A[root], A[child]);",
      "        root = child;",
      "    }",
      "}"
    ],
    examTips: sortingTips(["堆排序不稳定，空间复杂度 O(1)。", "建堆从最后一个非叶子结点 n/2-1 开始。", "大根堆用于升序，小根堆用于降序。"]),
    buildSteps: buildHeapSortSteps,
  },
  seq_search: {
    title: "顺序查找",
    category: "查找 / 线性表查找",
    code: [
      "int SeqSearch(int A[], int n, int key) {",
      "    for (int i = 0; i < n; i++) {",
      "        if (A[i] == key)",
      "            return i;",
      "    }",
      "    return -1;",
      "}"
    ],
    examTips: ["平均查找长度 ASL 成功时约为 (n+1)/2。", "顺序查找适用于顺序表和链表。", "可用哨兵减少边界判断。"],
    buildSteps: buildSeqSearchSteps,
  },
  binary_search: {
    title: "折半查找",
    category: "查找 / 有序顺序表",
    code: [
      "int BinarySearch(int A[], int n, int key) {",
      "    int low = 0, high = n - 1;",
      "    while (low <= high) {",
      "        int mid = (low + high) / 2;",
      "        if (A[mid] == key) return mid;",
      "        else if (A[mid] < key) low = mid + 1;",
      "        else high = mid - 1;",
      "    }",
      "    return -1;",
      "}"
    ],
    examTips: ["折半查找要求有序且支持随机访问。", "判定树高度约为 ⌈log2(n+1)⌉。", "链表不适合折半查找。"],
    buildSteps: buildBinarySearchSteps,
  },
  block_search: {
    title: "分块查找",
    category: "查找 / 索引顺序查找",
    code: [
      "int BlockSearch(int A[], Index idx[], int b, int key) {",
      "    int k = 0;",
      "    while (k < b && key > idx[k].maxKey) k++;",
      "    if (k == b) return -1;",
      "    for (int i = idx[k].start; i <= idx[k].end; i++)",
      "        if (A[i] == key) return i;",
      "    return -1;",
      "}"
    ],
    examTips: ["分块查找要求块间有序，块内可以无序。", "先查索引表，再在块内顺序查找。", "平均查找长度与块大小有关。"],
    buildSteps: buildBlockSearchSteps,
  },
  binary_tree_create: {
    title: "普通二叉树创建",
    category: "树 / 二叉树基础",
    code: [
      "BiTree CreateTree() {",
      "    ElemType x = Read();",
      "    if (x == '#') return NULL;",
      "    BiTNode *T = new BiTNode;",
      "    T->data = x;",
      "    T->lchild = CreateTree();",
      "    T->rchild = CreateTree();",
      "    return T;",
      "}"
    ],
    examTips: ["普通二叉树不要求左小右大。", "先序创建常用 # 表示空树。", "遍历递归代码要会默写。"],
    buildSteps: buildBinaryTreeCreateSteps,
  },
  complete_binary_tree: {
    title: "完全二叉树与顺序存储",
    category: "树 / 完全二叉树",
    code: [
      "// 下标从 0 开始",
      "left(i)  = 2 * i + 1;",
      "right(i) = 2 * i + 2;",
      "parent(i)= (i - 1) / 2;",
      "// 插入新结点时放在数组末尾",
      "A[n] = x;",
      "n++;"
    ],
    examTips: ["完全二叉树适合顺序存储。", "编号从 1 或从 0 开始公式不同，考试要看清楚。", "堆就是完全二叉树的典型应用。"],
    buildSteps: buildCompleteTreeSteps,
  },
  bst_delete: {
    title: "二叉排序树删除",
    category: "树 / BST 增删查改",
    code: [
      "BiTNode* DeleteBST(BiTNode *T, int key) {",
      "    if (T == NULL) return NULL;",
      "    if (key < T->data) T->lchild = DeleteBST(T->lchild, key);",
      "    else if (key > T->data) T->rchild = DeleteBST(T->rchild, key);",
      "    else {",
      "        if (T->lchild && T->rchild) {",
      "            BiTNode *s = MinNode(T->rchild);",
      "            T->data = s->data;",
      "            T->rchild = DeleteBST(T->rchild, s->data);",
      "        } else T = (T->lchild) ? T->lchild : T->rchild;",
      "    }",
      "    return T;",
      "}"
    ],
    examTips: ["BST 删除分三类：叶子、单分支、双分支。", "双分支常用中序前驱或中序后继替代。", "删除后中序序列仍然递增。"],
    buildSteps: buildBstDeleteSteps,
  },
  tree_update: {
    title: "树结点修改：查找 + 删除 + 插入",
    category: "树 / 增删查改",
    code: [
      "bool UpdateBST(BiTree &T, int oldKey, int newKey) {",
      "    if (SearchBST(T, oldKey) == NULL) return false;",
      "    DeleteBST(T, oldKey);",
      "    InsertBST(T, newKey);",
      "    return true;",
      "}"
    ],
    examTips: ["BST 中不能随便改关键字，否则会破坏左小右大的性质。", "修改关键字通常等价于删除旧值再插入新值。"],
    buildSteps: buildTreeUpdateSteps,
  },
  avl_insert: {
    title: "平衡二叉树 AVL 插入旋转",
    category: "树 / 平衡二叉树",
    code: [
      "BiTree InsertAVL(BiTree T, int key) {",
      "    if (T == NULL) return NewNode(key);",
      "    if (key < T->data) T->lchild = InsertAVL(T->lchild, key);",
      "    else if (key > T->data) T->rchild = InsertAVL(T->rchild, key);",
      "    UpdateHeight(T);",
      "    if (Balance(T) < -1 && key > T->rchild->data)",
      "        return LeftRotate(T);   // RR 型",
      "    if (Balance(T) > 1 && key < T->lchild->data)",
      "        return RightRotate(T);  // LL 型",
      "    return T;",
      "}"
    ],
    examTips: ["AVL 平衡因子只能是 -1、0、1。", "LL 右旋，RR 左旋，LR 先左后右，RL 先右后左。", "旋转不改变中序有序序列。"],
    buildSteps: buildAvlInsertSteps,
  },
  btree_search: {
    title: "B 树查找",
    category: "树 / B 树",
    code: [
      "BTree SearchBTree(BTree T, int key) {",
      "    while (T != NULL) {",
      "        int i = SearchInNode(T, key);",
      "        if (i < T->n && T->key[i] == key) return T;",
      "        T = T->child[i];",
      "    }",
      "    return NULL;",
      "}"
    ],
    examTips: ["B 树是多路平衡查找树。", "结点内查找 + 沿孩子指针下降。", "所有叶子结点在同一层。"],
    buildSteps: buildBtreeSearchSteps,
  },
  btree_insert: {
    title: "B 树插入与分裂",
    category: "树 / B 树",
    code: [
      "InsertBTree(T, key) {",
      "    leaf = SearchLeaf(T, key);",
      "    InsertKey(leaf, key);",
      "    while (leaf->keynum > maxKey) {",
      "        mid = leaf->key[midIndex];",
      "        SplitNode(leaf, left, right);",
      "        PushUpToParent(mid);",
      "        leaf = parent;",
      "    }",
      "}"
    ],
    examTips: ["B 树插入一定插到叶子结点。", "结点溢出时中间关键字上升，左右分裂。", "根溢出会产生新根，树高加 1。"],
    buildSteps: buildBtreeInsertSteps,
  },
  btree_delete: {
    title: "B 树删除借位/合并",
    category: "树 / B 树",
    code: [
      "DeleteBTree(T, key) {",
      "    p = SearchNode(T, key);",
      "    if (key is in internal node)",
      "        ReplaceByPredecessorOrSuccessor(p);",
      "    DeleteKeyFromLeaf(p, key);",
      "    if (p->keynum < minKey) {",
      "        if (SiblingCanLend(p)) BorrowFromSibling(p);",
      "        else MergeWithSibling(p);",
      "    }",
      "}"
    ],
    examTips: ["B 树删除先尽量转化为叶子删除。", "下溢处理：能借先借，不能借再合并。", "合并可能向上递归，根变空时树高减 1。"],
    buildSteps: buildBtreeDeleteSteps,
  },
  bplus_search: {
    title: "B+ 树范围查找",
    category: "树 / B+ 树",
    code: [
      "RangeSearchBPlusTree(T, low, high) {",
      "    leaf = FindFirstLeaf(T, low);",
      "    while (leaf != NULL) {",
      "        for each key in leaf:",
      "            if (low <= key && key <= high) output(key);",
      "            if (key > high) return;",
      "        leaf = leaf->next;",
      "    }",
      "}"
    ],
    examTips: ["B+ 树所有数据关键字都在叶子层。", "叶子结点通常用链指针相连，适合范围查询。", "内部结点关键字是索引，常出现重复关键字。"],
    buildSteps: buildBplusSearchSteps,
  },
  bplus_insert: {
    title: "B+ 树插入与叶子链",
    category: "树 / B+ 树",
    code: [
      "InsertBPlusTree(T, key) {",
      "    leaf = SearchLeaf(T, key);",
      "    InsertIntoLeaf(leaf, key);",
      "    if (leaf overflow) {",
      "        newLeaf = SplitLeaf(leaf);",
      "        MaintainLeafLink(leaf, newLeaf);",
      "        CopyUp(newLeaf->firstKey);",
      "    }",
      "}"
    ],
    examTips: ["B+ 树插入后要维护叶子链表。", "叶子分裂时，分裂点关键字复制到父索引。", "B 树是上升/移动，B+ 树常见是复制索引。"],
    buildSteps: buildBplusInsertSteps,
  },
  rb_insert: {
    title: "红黑树插入修正",
    category: "树 / 红黑树",
    code: [
      "InsertRBTree(T, z) {",
      "    BSTInsert(T, z);",
      "    z->color = RED;",
      "    while (z->parent->color == RED) {",
      "        y = Uncle(z);",
      "        if (y->color == RED) Recolor(parent, uncle, grandparent);",
      "        else RotateAndRecolor(z);",
      "    }",
      "    T->root->color = BLACK;",
      "}"
    ],
    examTips: ["红黑树根黑、叶黑、红结点孩子黑、任一路径黑高相同。", "新插入结点先染红，减少黑高破坏。", "父红叔红重染色，父红叔黑旋转加重染色。"],
    buildSteps: buildRbInsertSteps,
  },
  forest_convert: {
    title: "树 / 森林 / 二叉树转换",
    category: "树 / 孩子兄弟表示法",
    code: [
      "// 树或森林转二叉树：孩子兄弟表示法",
      "node->lchild = firstChild(node);",
      "node->rchild = nextSibling(node);",
      "// 森林中各棵树的根也按兄弟相连",
      "root1->rchild = root2;",
      "root2->rchild = root3;"
    ],
    examTips: ["口诀：左孩子，右兄弟。", "森林转二叉树时，根与根之间也用右指针连接。", "二叉树还原森林时，沿根的右链切开。"],
    buildSteps: buildForestConvertSteps,
  },
  graph_directed: {
    title: "有向图：邻接表与入度出度",
    category: "图 / 有向图",
    code: [
      "// 有向图邻接表只记录出边",
      "addEdge(u, v) {",
      "    Adj[u].push(v);",
      "    indegree[v]++;",
      "    outdegree[u]++;",
      "}",
      "// DAG 可做拓扑排序"
    ],
    examTips: ["有向边 u→v 只能从 u 到 v。", "入度为 0 的点常作为拓扑排序起点。", "有向无环图 DAG 才存在拓扑序列。"],
    buildSteps: buildDirectedGraphSteps,
  },
  graph_undirected: {
    title: "无向图：边与连通分量",
    category: "图 / 无向图",
    code: [
      "// 无向图一条边通常存两次",
      "addEdge(u, v) {",
      "    Adj[u].push(v);",
      "    Adj[v].push(u);",
      "}",
      "// DFS/BFS 可求连通分量"
    ],
    examTips: ["无向边 u—v 两端都能走。", "邻接表中一条无向边会出现两次。", "遍历无向图可判断连通分量。"],
    buildSteps: buildUndirectedGraphSteps,
  },
  reverse_toposort: {
    title: "逆拓扑排序",
    category: "图 / DAG",
    code: [
      "void DFSTopo(Vertex v) {",
      "    visited[v] = true;",
      "    for each w in Adj[v]",
      "        if (!visited[w]) DFSTopo(w);",
      "    output(v);  // 后序输出",
      "}",
      "// output 序列就是逆拓扑序列"
    ],
    examTips: ["逆拓扑排序可用 DFS 后序输出。", "拓扑排序和逆拓扑排序都要求图是 DAG。", "有环时不存在拓扑序列。"],
    buildSteps: buildReverseTopoSteps,
  },
  infix_to_postfix: {
    title: "中缀转后缀：运算符栈",
    category: "表达式 / 栈应用",
    code: [
      "for each token x in expression:",
      "    if x is operand: output(x);",
      "    else if x == '(' : push(opStack, x);",
      "    else if x == ')' :",
      "        while top != '(' : output(pop(opStack));",
      "        pop '(';",
      "    else:",
      "        while top priority >= x priority:",
      "            output(pop(opStack));",
      "        push(opStack, x);",
      "while opStack not empty: output(pop(opStack));"
    ],
    examTips: ["中缀转后缀核心是运算符栈。", "操作数直接输出，运算符根据优先级入栈/出栈。", "右括号触发弹栈直到左括号。"],
    buildSteps: buildInfixToPostfixSteps,
  },
  expr_tree_convert: {
    title: "前缀/中缀/后缀：画树法",
    category: "表达式 / 二叉树应用",
    code: [
      "for each token x in postfix:",
      "    if x is operand: push(new leaf x);",
      "    else:",
      "        right = pop();",
      "        left = pop();",
      "        push(new tree x(left, right));",
      "// preorder  -> prefix",
      "// inorder   -> infix",
      "// postorder -> postfix"
    ],
    examTips: ["表达式树根通常是最后参与运算的运算符。", "由后缀建树时，先弹出的是右孩子。", "前序=前缀，中序=中缀，后序=后缀。"],
    buildSteps: buildExprTreeConvertSteps,
  },
});

/* ========================= 用户定制增强：AVL 四类旋转、复杂表达式、顺序表/链表插删 ========================= */

function lineList(items, activeIndex = -1, extra = {}) {
  return { kind: "linear", structure: "list", items: clone(items), active: activeIndex, ...extra };
}

function seqListState(items, length, extra = {}) {
  return { kind: "linear", structure: "seqlist", items: clone(items), length, capacity: extra.capacity || items.length, ...extra };
}

function renderLinear(state) {
  if (state.structure === "stack") {
    const items = (state.items || []).map((x, i) => `<div class="stack-item ${state.active === i ? "active" : ""}">${escapeHtml(x)}</div>`).join("");
    visualCanvas.innerHTML = `<div class="linear-wrap"><div class="stack-box"><div class="stack-top">top 指向栈顶</div><div class="stack-items">${items}</div></div></div>`;
    return;
  }
  if (state.structure === "queue") {
    const items = (state.items || []).map((x, i) => `<div class="queue-item ${state.active === i ? "active" : ""}">${escapeHtml(x)}</div>`).join("");
    visualCanvas.innerHTML = `<div class="linear-wrap"><div class="queue-box"><div class="queue-labels"><span>front 队头</span><span>rear 队尾</span></div><div class="queue-items">${items || "<span class='empty-state'>空队列</span>"}</div></div></div>`;
    return;
  }
  if (state.structure === "seqlist") {
    const items = state.items || [];
    const length = state.length ?? items.filter(x => x !== "").length;
    const active = safeSet(state.active);
    const move = safeSet(state.move);
    const insert = safeSet(state.insert);
    const del = safeSet(state.delete);
    const cells = items.map((x, i) => {
      const cls = ["seq-cell"];
      if (active.has(i)) cls.push("active");
      if (move.has(i)) cls.push("move");
      if (insert.has(i)) cls.push("insert");
      if (del.has(i)) cls.push("delete");
      if (i >= length) cls.push("unused");
      return `<div class="seq-slot"><div class="${cls.join(" ")}">${escapeHtml(x || "空")}</div><div class="seq-index">data[${i}]</div></div>`;
    }).join("");
    const markers = (state.markers || []).map(x => `<span class="pointer-badge">${escapeHtml(x)}</span>`).join("");
    visualCanvas.innerHTML = `<div class="pointer-row">${markers}</div><div class="linear-wrap"><div class="seq-list-box"><div class="seq-list-title">顺序表：一段连续存储空间，length = ${length}，capacity = ${items.length}</div><div class="seq-cells">${cells}</div><div class="graph-note">${escapeHtml(state.note || "插入要从后往前移动，删除要从前往后移动。")}</div></div></div>`;
    return;
  }
  const nodes = state.items || [];
  const pointerLabels = state.pointerLabels || {};
  const html = nodes.map((x, i) => {
    const cls = ["list-node"];
    if (state.active === i) cls.push("active");
    if (state.newIndex === i) cls.push("new");
    if (state.deleteIndex === i) cls.push("delete");
    const label = pointerLabels[i] ? `<div class="pointer-label">${escapeHtml(pointerLabels[i])}</div>` : "";
    const arrowText = state.skipEdgeFrom === i ? "⤷" : "→";
    const arrow = i < nodes.length - 1 ? `<span class="arrow ${state.skipEdgeFrom === i ? "skip" : ""}">${arrowText}</span>` : `<span class="arrow">∅</span>`;
    return `<div class="list-node-wrap">${label}<div class="${cls.join(" ")}">${escapeHtml(x)}</div></div>${arrow}`;
  }).join("");
  visualCanvas.innerHTML = `<div class="linear-wrap"><div class="list-box"><div class="list-items"><span class="arrow">head →</span>${html}</div><div class="graph-note">${escapeHtml(state.note || "单链表每个结点包含 data 和 next 指针，插删时重点看指针先后顺序。")}</div></div></div>`;
}

function renderExpression(state) {
  const tokens = state.tokens || [];
  const tokenHtml = tokens.map((t, i) => `<span class="token ${i === state.index ? "active" : ""}">${escapeHtml(t)}</span>`).join("");
  const opStack = (state.opStack || []).map(x => `<div class="mini-stack-item">${escapeHtml(x)}</div>`).join("");
  const valStack = (state.valStack || []).map(x => `<div class="mini-stack-item expr-node-chip">${escapeHtml(x)}</div>`).join("");
  const output = (state.output || []).map(x => `<span class="output-token">${escapeHtml(x)}</span>`).join("");
  let treeSvg = "";
  if (state.tree) {
    const nodes = state.tree.nodes || [];
    const edges = state.tree.edges || [];
    const map = Object.fromEntries(nodes.map(n => [n.id, n]));
    const edgeEls = edges.map(([a, b]) => {
      const from = map[a], to = map[b];
      if (!from || !to) return "";
      return `<line class="edge" x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" />`;
    }).join("");
    const nodeEls = nodes.map(n => `<g class="node ${n.op ? "current" : "visited"}" transform="translate(${n.x}, ${n.y})"><circle r="22"></circle><text>${escapeHtml(n.label)}</text></g>`).join("");
    const vb = state.tree.viewBox || "0 0 760 255";
    treeSvg = `<svg class="expr-tree wide" viewBox="${vb}">${edgeEls}${nodeEls}</svg>`;
  }
  visualCanvas.innerHTML = `<div class="expr-wrap"><div class="expr-tokens">${tokenHtml}</div><div class="expr-panels"><div class="expr-panel"><b>运算符栈</b><div class="mini-stack">${opStack || "<span class='muted'>空</span>"}</div></div><div class="expr-panel"><b>输出 / 操作数栈</b><div class="expr-output">${output || valStack || "<span class='muted'>空</span>"}</div></div></div>${treeSvg}</div><div class="graph-note">${escapeHtml(state.note || "中缀转后缀看运算符栈；表达式求值看操作数栈 + 运算符栈；三式互转推荐画表达式树。")}</div>`;
}

function avlState(nodes, edges, extra = {}) {
  return { kind: "tree", nodes, edges, ...extra };
}

function buildAvlCaseSteps(type) {
  const steps = [];
  const cases = {
    LL: {
      title: "LL 型：插入到失衡结点左孩子的左子树，右旋一次",
      before: [
        { id: "30", label: "30", x: 400, y: 70 },
        { id: "20", label: "20", x: 275, y: 175 },
        { id: "10", label: "10", x: 185, y: 280 },
      ],
      beforeEdges: [["30", "20"], ["20", "10"]],
      mid: null,
      after: [
        { id: "20", label: "20", x: 400, y: 80 },
        { id: "10", label: "10", x: 270, y: 190 },
        { id: "30", label: "30", x: 530, y: 190 },
      ],
      afterEdges: [["20", "10"], ["20", "30"]],
      lineDetect: 3,
      lineRotate: 4,
      rotate: "RightRotate(30)",
      reason: "30 的左子树高度比右子树高 2，且新结点 10 插在 20 的左边。",
    },
    RR: {
      title: "RR 型：插入到失衡结点右孩子的右子树，左旋一次",
      before: [
        { id: "10", label: "10", x: 400, y: 70 },
        { id: "20", label: "20", x: 525, y: 175 },
        { id: "30", label: "30", x: 615, y: 280 },
      ],
      beforeEdges: [["10", "20"], ["20", "30"]],
      after: [
        { id: "20", label: "20", x: 400, y: 80 },
        { id: "10", label: "10", x: 270, y: 190 },
        { id: "30", label: "30", x: 530, y: 190 },
      ],
      afterEdges: [["20", "10"], ["20", "30"]],
      lineDetect: 3,
      lineRotate: 4,
      rotate: "LeftRotate(10)",
      reason: "10 的右子树高度比左子树高 2，且新结点 30 插在 20 的右边。",
    },
    LR: {
      title: "LR 型：插入到失衡结点左孩子的右子树，先左旋再右旋",
      before: [
        { id: "30", label: "30", x: 400, y: 70 },
        { id: "10", label: "10", x: 275, y: 175 },
        { id: "20", label: "20", x: 365, y: 280 },
      ],
      beforeEdges: [["30", "10"], ["10", "20"]],
      mid: {
        nodes: [
          { id: "30", label: "30", x: 400, y: 70 },
          { id: "20", label: "20", x: 275, y: 175 },
          { id: "10", label: "10", x: 185, y: 280 },
        ],
        edges: [["30", "20"], ["20", "10"]],
        line: 4,
        desc: "先对左孩子 10 做左旋，把 LR 形状转成 LL 形状。",
        result: "LeftRotate(10) 后，20 成为 30 的左孩子。"
      },
      after: [
        { id: "20", label: "20", x: 400, y: 80 },
        { id: "10", label: "10", x: 270, y: 190 },
        { id: "30", label: "30", x: 530, y: 190 },
      ],
      afterEdges: [["20", "10"], ["20", "30"]],
      lineDetect: 3,
      lineRotate: 5,
      rotate: "RightRotate(30)",
      reason: "30 左高失衡，但新结点 20 插在左孩子 10 的右边。",
    },
    RL: {
      title: "RL 型：插入到失衡结点右孩子的左子树，先右旋再左旋",
      before: [
        { id: "10", label: "10", x: 400, y: 70 },
        { id: "30", label: "30", x: 525, y: 175 },
        { id: "20", label: "20", x: 435, y: 280 },
      ],
      beforeEdges: [["10", "30"], ["30", "20"]],
      mid: {
        nodes: [
          { id: "10", label: "10", x: 400, y: 70 },
          { id: "20", label: "20", x: 525, y: 175 },
          { id: "30", label: "30", x: 615, y: 280 },
        ],
        edges: [["10", "20"], ["20", "30"]],
        line: 4,
        desc: "先对右孩子 30 做右旋，把 RL 形状转成 RR 形状。",
        result: "RightRotate(30) 后，20 成为 10 的右孩子。"
      },
      after: [
        { id: "20", label: "20", x: 400, y: 80 },
        { id: "10", label: "10", x: 270, y: 190 },
        { id: "30", label: "30", x: 530, y: 190 },
      ],
      afterEdges: [["20", "10"], ["20", "30"]],
      lineDetect: 3,
      lineRotate: 5,
      rotate: "LeftRotate(10)",
      reason: "10 右高失衡，但新结点 20 插在右孩子 30 的左边。",
    },
  };
  const c = cases[type];
  addStep(steps, 0, c.title, avlState(c.before.slice(0, 2), [c.beforeEdges[0]], { current: [c.before[0].id], note: `准备演示 ${type} 型旋转。` }), `${type} 型`);
  addStep(steps, 2, `按 BST 规则插入新结点 ${c.before[2].label}。`, avlState(c.before, c.beforeEdges, { insert: [c.before[2].id], activeEdges: [c.beforeEdges[1]], note: "先按二叉排序树插入，再沿祖先回溯检查平衡因子。" }), "插入完成，开始回溯");
  addStep(steps, 4, `回溯到失衡结点：${c.reason}`, avlState(c.before, c.beforeEdges, { danger: [c.before[0].id], current: [c.before[1].id], insert: [c.before[2].id], note: "平衡因子 BF = 左子树高度 - 右子树高度；绝对值超过 1 就失衡。" }), "发现最小失衡子树");
  addStep(steps, c.lineDetect, `判断为 ${type} 型。`, avlState(c.before, c.beforeEdges, { danger: [c.before[0].id], current: [c.before[2].id], note: `${type} 型口诀：${type === "LL" ? "左左右旋" : type === "RR" ? "右右左旋" : type === "LR" ? "左右：先左后右" : "右左：先右后左"}` }), "匹配旋转类型");
  if (c.mid) {
    addStep(steps, c.mid.line, c.mid.desc, avlState(c.mid.nodes, c.mid.edges, { current: ["20"], note: c.mid.result }), c.mid.result);
  }
  addStep(steps, c.lineRotate, `执行 ${c.rotate}，让中间关键字 20 成为这棵子树的新根。`, avlState(c.after, c.afterEdges, { current: ["20"], visited: ["10", "20", "30"], note: "旋转只改变指针方向，不改变中序序列 10、20、30。" }), "旋转完成");
  addStep(steps, 5, `${type} 型调整结束，整棵子树重新满足 AVL 平衡。`, avlState(c.after, c.afterEdges, { visited: ["10", "20", "30"], note: "408 手算重点：先判断 LL/RR/LR/RL，再套对应旋转。" }), "中序仍为：10，20，30");
  return steps;
}

function buildInfixToPostfixStepsComplex() {
  const steps = [];
  const tokens = ["(", "A", "+", "B", ")", "*", "(", "C", "-", "D", ")", "/", "E", "+", "F", "*", "(", "G", "-", "H", ")"];
  const prec = { "+": 1, "-": 1, "*": 2, "/": 2 };
  const output = [];
  const ops = [];
  addStep(steps, 0, "使用更复杂的中缀表达式：(A+B)*(C-D)/E+F*(G-H)。核心仍然是：操作数直接输出，运算符靠栈处理优先级。", { kind: "expression", tokens, index: -1, opStack: [], output: [], note: "目标后缀：A B + C D - * E / F G H - * +" }, "开始扫描");
  tokens.forEach((t, i) => {
    if (/^[A-Z]$/.test(t)) {
      output.push(t);
      addStep(steps, 1, `读到操作数 ${t}，直接输出。`, { kind: "expression", tokens, index: i, opStack: [...ops], output: [...output], note: "操作数不入运算符栈。" }, `输出：${output.join(" ")}`);
    } else if (t === "(") {
      ops.push(t);
      addStep(steps, 2, "读到左括号，入运算符栈，用来隔离括号内外的优先级。", { kind: "expression", tokens, index: i, opStack: [...ops], output: [...output] }, `运算符栈：${ops.join(" ")}`);
    } else if (t === ")") {
      addStep(steps, 3, "读到右括号，开始弹出运算符，直到遇到左括号。", { kind: "expression", tokens, index: i, opStack: [...ops], output: [...output] }, "处理括号内表达式");
      while (ops.length && ops[ops.length - 1] !== "(") {
        output.push(ops.pop());
        addStep(steps, 4, "把括号内的运算符弹出到输出序列。", { kind: "expression", tokens, index: i, opStack: [...ops], output: [...output] }, `输出：${output.join(" ")}`);
      }
      ops.pop();
      addStep(steps, 5, "弹出左括号，左括号本身不输出。", { kind: "expression", tokens, index: i, opStack: [...ops], output: [...output] }, `运算符栈：${ops.join(" ") || "空"}`);
    } else {
      addStep(steps, 6, `读到运算符 ${t}，和栈顶运算符比较优先级。`, { kind: "expression", tokens, index: i, opStack: [...ops], output: [...output], note: "若栈顶优先级 ≥ 当前运算符，则先弹栈输出。" }, `当前运算符：${t}`);
      while (ops.length && ops[ops.length - 1] !== "(" && prec[ops[ops.length - 1]] >= prec[t]) {
        output.push(ops.pop());
        addStep(steps, 7, "栈顶运算符优先级更高或相同，先弹出到输出序列。", { kind: "expression", tokens, index: i, opStack: [...ops], output: [...output] }, `输出：${output.join(" ")}`);
      }
      ops.push(t);
      addStep(steps, 8, `当前运算符 ${t} 入栈。`, { kind: "expression", tokens, index: i, opStack: [...ops], output: [...output] }, `运算符栈：${ops.join(" ")}`);
    }
  });
  while (ops.length) {
    output.push(ops.pop());
    addStep(steps, 10, "扫描结束，把剩余运算符依次弹出。", { kind: "expression", tokens, index: tokens.length, opStack: [...ops], output: [...output] }, `输出：${output.join(" ")}`);
  }
  addStep(steps, 10, "最终得到后缀表达式。后缀表达式没有括号，计算时只需要操作数栈。", { kind: "expression", tokens, index: tokens.length, opStack: [], output: [...output], note: "完整后缀：A B + C D - * E / F G H - * +" }, output.join(" "));
  return steps;
}

function applyTopOperation(nums, ops, steps, tokens, index, reason) {
  const op = ops.pop();
  const b = nums.pop();
  const a = nums.pop();
  let v = 0;
  if (op === "+") v = a + b;
  if (op === "-") v = a - b;
  if (op === "*") v = a * b;
  if (op === "/") v = a / b;
  nums.push(v);
  addStep(steps, 7, `${reason}：弹出操作数 ${a}、${b} 和运算符 ${op}，计算 ${a}${op}${b}=${v}，结果压回操作数栈。`, { kind: "expression", tokens, index, opStack: [...ops], valStack: [...nums], note: "操作数栈保存尚未合并的中间结果，运算符栈保存暂时不能计算的运算符。" }, `操作数栈：${nums.join("，")}`);
}

function buildExpressionTwoStackSteps() {
  const steps = [];
  const tokens = ["3", "+", "(", "4", "*", "5", "-", "(", "6", "/", "2", "+", "7", ")", ")", "*", "2"];
  const prec = { "+": 1, "-": 1, "*": 2, "/": 2 };
  const nums = [];
  const ops = [];
  addStep(steps, 0, "双栈法求值示例：3+(4*5-(6/2+7))*2。一个操作数栈 nums，一个运算符栈 ops。", { kind: "expression", tokens, index: -1, opStack: [], valStack: [], note: "这个过程能帮助理解中缀表达式为什么需要栈。" }, "开始扫描");
  tokens.forEach((t, i) => {
    if (/^\d+$/.test(t)) {
      nums.push(Number(t));
      addStep(steps, 1, `读到数字 ${t}，压入操作数栈。`, { kind: "expression", tokens, index: i, opStack: [...ops], valStack: [...nums] }, `nums：${nums.join("，")}`);
    } else if (t === "(") {
      ops.push(t);
      addStep(steps, 2, "读到左括号，压入运算符栈。", { kind: "expression", tokens, index: i, opStack: [...ops], valStack: [...nums] }, "左括号作为优先级边界");
    } else if (t === ")") {
      addStep(steps, 3, "读到右括号，持续计算直到遇到左括号。", { kind: "expression", tokens, index: i, opStack: [...ops], valStack: [...nums] }, "开始处理括号");
      while (ops.length && ops[ops.length - 1] !== "(") applyTopOperation(nums, ops, steps, tokens, i, "括号闭合");
      ops.pop();
      addStep(steps, 4, "弹出左括号，括号内已经合并成一个操作数。", { kind: "expression", tokens, index: i, opStack: [...ops], valStack: [...nums] }, `nums：${nums.join("，")}`);
    } else {
      addStep(steps, 5, `读到运算符 ${t}，先看栈顶运算符能不能先算。`, { kind: "expression", tokens, index: i, opStack: [...ops], valStack: [...nums] }, "比较优先级");
      while (ops.length && ops[ops.length - 1] !== "(" && prec[ops[ops.length - 1]] >= prec[t]) applyTopOperation(nums, ops, steps, tokens, i, "栈顶优先级不低于当前运算符");
      ops.push(t);
      addStep(steps, 6, `当前运算符 ${t} 入栈，等待右操作数。`, { kind: "expression", tokens, index: i, opStack: [...ops], valStack: [...nums] }, `ops：${ops.join("，")}`);
    }
  });
  while (ops.length) applyTopOperation(nums, ops, steps, tokens, tokens.length, "扫描结束");
  addStep(steps, 9, "操作数栈最后只剩一个数，就是表达式结果。", { kind: "expression", tokens, index: tokens.length, opStack: [], valStack: [...nums], note: "3+(4*5-(6/2+7))*2 = 23" }, `最终结果：${nums[0]}`);
  return steps;
}

function complexExprTreeState(stage = "final") {
  const nodes = [
    { id: "rootPlus", label: "+", x: 380, y: 35, op: true },
    { id: "div", label: "/", x: 255, y: 92, op: true },
    { id: "mulLeft", label: "*", x: 185, y: 150, op: true },
    { id: "plusAB", label: "+", x: 105, y: 205, op: true },
    { id: "A", label: "A", x: 60, y: 245 },
    { id: "B", label: "B", x: 145, y: 245 },
    { id: "minusCD", label: "-", x: 265, y: 205, op: true },
    { id: "C", label: "C", x: 225, y: 245 },
    { id: "D", label: "D", x: 305, y: 245 },
    { id: "E", label: "E", x: 330, y: 150 },
    { id: "mulRight", label: "*", x: 530, y: 92, op: true },
    { id: "F", label: "F", x: 470, y: 150 },
    { id: "minusGH", label: "-", x: 590, y: 150, op: true },
    { id: "G", label: "G", x: 550, y: 210 },
    { id: "H", label: "H", x: 630, y: 210 },
  ];
  const edges = [["rootPlus", "div"], ["rootPlus", "mulRight"], ["div", "mulLeft"], ["div", "E"], ["mulLeft", "plusAB"], ["mulLeft", "minusCD"], ["plusAB", "A"], ["plusAB", "B"], ["minusCD", "C"], ["minusCD", "D"], ["mulRight", "F"], ["mulRight", "minusGH"], ["minusGH", "G"], ["minusGH", "H"]];
  if (stage === "left") return { viewBox: "0 0 700 280", nodes: nodes.filter(n => ["div", "mulLeft", "plusAB", "A", "B", "minusCD", "C", "D", "E"].includes(n.id)), edges: edges.filter(e => ["div", "mulLeft", "plusAB", "A", "B", "minusCD", "C", "D", "E"].includes(e[0]) && ["div", "mulLeft", "plusAB", "A", "B", "minusCD", "C", "D", "E"].includes(e[1])) };
  return { viewBox: "0 0 700 280", nodes, edges };
}

function buildExprTreeConvertStepsComplex() {
  const steps = [];
  const tokens = ["A", "B", "+", "C", "D", "-", "*", "E", "/", "F", "G", "H", "-", "*", "+"];
  addStep(steps, 0, "用复杂后缀表达式建树：A B + C D - * E / F G H - * +。由树可读出中缀、前缀、后缀。", { kind: "expression", tokens, index: -1, valStack: [], note: "对应中缀：((A+B)*(C-D))/E + F*(G-H)" }, "开始建树");
  addStep(steps, 1, "先处理 A B +，遇到 + 时弹出 B 作右孩子，A 作左孩子，形成 A+B 子树。", { kind: "expression", tokens, index: 2, valStack: ["(A+B)"], tree: { viewBox: "0 0 300 160", nodes: [{ id: "plusAB", label: "+", x: 150, y: 45, op: true }, { id: "A", label: "A", x: 95, y: 115 }, { id: "B", label: "B", x: 205, y: 115 }], edges: [["plusAB", "A"], ["plusAB", "B"]] }, note: "先弹出的是右孩子。" });
  addStep(steps, 3, "再处理 C D -，形成 C-D 子树。", { kind: "expression", tokens, index: 5, valStack: ["(A+B)", "(C-D)"], note: "两个子表达式都在操作数栈中等待合并。" });
  addStep(steps, 3, "读到 *，弹出 (C-D) 和 (A+B)，组成 (A+B)*(C-D)。", { kind: "expression", tokens, index: 6, valStack: ["((A+B)*(C-D))"], tree: complexExprTreeState("left"), note: "运算符结点作为父结点，两个子树作为左右孩子。" });
  addStep(steps, 3, "读到 /，把左侧乘法子树和 E 合并，得到 ((A+B)*(C-D))/E。", { kind: "expression", tokens, index: 8, valStack: ["(((A+B)*(C-D))/E)"], tree: complexExprTreeState("left"), note: "除法左孩子是前面的乘法子树，右孩子是 E。" });
  addStep(steps, 3, "右侧继续处理 F G H - *，得到 F*(G-H)。", { kind: "expression", tokens, index: 13, valStack: ["(((A+B)*(C-D))/E)", "(F*(G-H))"], note: "右侧乘法子树准备和左侧整体相加。" });
  addStep(steps, 4, "最后读到 +，合并左右两棵子树，得到完整表达式树。", { kind: "expression", tokens, index: 14, valStack: ["(((A+B)*(C-D))/E + F*(G-H))"], tree: complexExprTreeState("final"), note: "根结点是最后参与运算的 +。" });
  addStep(steps, 7, "遍历这棵表达式树：先序是前缀，中序是中缀，后序是后缀。", { kind: "expression", tokens, index: 14, valStack: ["前缀：+ / * + A B - C D E * F - G H", "中缀：((A+B)*(C-D))/E+F*(G-H)", "后缀：A B + C D - * E / F G H - * +"], tree: complexExprTreeState("final"), note: "画树法最适合检查前缀/中缀/后缀互转。" }, "前缀：+ / * + A B - C D E * F - G H；后缀：A B + C D - * E / F G H - * +");
  return steps;
}

function buildSeqListInsertSteps() {
  const steps = [];
  let arr = ["A", "B", "D", "E", "", ""];
  let len = 4;
  addStep(steps, 0, "顺序表插入：要在第 2 个位置插入 C。顺序表是连续存储，所以必须先给 C 腾出位置。", seqListState(arr, len, { active: [2], markers: ["i=2", "x=C"], note: "当前有效元素为 A、B、D、E。" }), "目标：A B C D E");
  addStep(steps, 1, "先判断插入位置是否合法，以及表是否已满。", seqListState(arr, len, { active: [2], markers: ["0 ≤ i ≤ length", "length < capacity"] }), "条件成立");
  addStep(steps, 2, "从最后一个有效元素开始向后移动，避免覆盖原数据。j = length - 1 = 3。", seqListState(arr, len, { active: [3], move: [3, 4], markers: ["j=3"] }), "准备移动 E");
  arr[4] = arr[3];
  addStep(steps, 3, "data[4] = data[3]，E 后移一格。", seqListState(arr, len, { active: [4], move: [3, 4], markers: ["E 后移"] }), `当前：${arr.join(" ")}`);
  addStep(steps, 2, "j--，继续移动 D。", seqListState(arr, len, { active: [2], move: [2, 3], markers: ["j=2"] }), "准备移动 D");
  arr[3] = arr[2];
  addStep(steps, 3, "data[3] = data[2]，D 后移一格。", seqListState(arr, len, { active: [3], move: [2, 3], markers: ["D 后移"] }), `当前：${arr.join(" ")}`);
  arr[2] = "C";
  addStep(steps, 5, "空位已经腾出，把 C 放入 data[2]。", seqListState(arr, len, { active: [2], insert: [2], markers: ["data[i]=C"] }), "插入新元素");
  len++;
  addStep(steps, 6, "length++，顺序表插入完成。", seqListState(arr, len, { insert: [2], markers: ["length=5"] }), "结果：A B C D E");
  return steps;
}

function buildSeqListDeleteSteps() {
  const steps = [];
  let arr = ["A", "B", "C", "D", "E", ""];
  let len = 5;
  addStep(steps, 0, "顺序表删除：删除 data[2] = C。删除后，后面的元素必须整体前移。", seqListState(arr, len, { active: [2], delete: [2], markers: ["i=2"] }), "目标：A B D E");
  addStep(steps, 1, "判断删除位置是否合法：0 ≤ i < length。", seqListState(arr, len, { active: [2], markers: ["位置合法"] }), "条件成立");
  arr[2] = arr[3];
  addStep(steps, 3, "data[2] = data[3]，D 前移覆盖 C。", seqListState(arr, len, { active: [2], move: [2, 3], markers: ["D 前移"] }), `当前：${arr.join(" ")}`);
  arr[3] = arr[4];
  addStep(steps, 3, "data[3] = data[4]，E 前移。", seqListState(arr, len, { active: [3], move: [3, 4], markers: ["E 前移"] }), `当前：${arr.join(" ")}`);
  arr[4] = "";
  len--;
  addStep(steps, 5, "length--，最后一个位置不再属于有效表长。", seqListState(arr, len, { markers: ["length=4"] }), "删除完成：A B D E");
  return steps;
}

function buildLinkedInsertStepsBetter() {
  const steps = [];
  const before = ["A", "B", "D", "E"];
  addStep(steps, 0, "单链表插入：在 B 后插入 C。链表不需要移动大量元素，只改指针。", lineList(before, 1, { pointerLabels: { 1: "p" }, note: "p 指向插入位置的前驱结点 B。" }), "目标：A → B → C → D → E");
  addStep(steps, 1, "找到前驱结点 p。考试代码常写成 GetElem(L, i-1) 或 while 循环定位。", lineList(before, 1, { pointerLabels: { 1: "p" } }), "p = B");
  addStep(steps, 2, "创建新结点 s，数据域为 C。", lineList(["A", "B", "C", "D", "E"], 2, { newIndex: 2, pointerLabels: { 1: "p", 2: "s" }, note: "此时 C 还没有真正接入链表。" }), "s = new Node(C)");
  addStep(steps, 3, "先执行 s->next = p->next，让 C 指向 D。这样不会丢失 D 后面的链。", lineList(["A", "B", "C", "D", "E"], 2, { newIndex: 2, pointerLabels: { 1: "p", 2: "s" }, note: "必须先接后继，再改前驱。" }), "C → D");
  addStep(steps, 4, "再执行 p->next = s，让 B 指向 C。", lineList(["A", "B", "C", "D", "E"], 1, { newIndex: 2, pointerLabels: { 1: "p", 2: "s" } }), "B → C");
  addStep(steps, 5, "插入完成。关键口诀：先连新结点的后继，再连前驱。", lineList(["A", "B", "C", "D", "E"], -1, { newIndex: 2 }), "A → B → C → D → E");
  return steps;
}

function buildLinkedDeleteSteps() {
  const steps = [];
  const list = ["A", "B", "C", "D", "E"];
  addStep(steps, 0, "单链表删除：删除 B 后面的结点 C。链表删除不移动元素，只改变 next 指针。", lineList(list, 1, { pointerLabels: { 1: "p" }, note: "p 指向被删结点的前驱 B。" }), "目标：A → B → D → E");
  addStep(steps, 1, "先找到前驱结点 p。", lineList(list, 1, { pointerLabels: { 1: "p" } }), "p = B");
  addStep(steps, 2, "令 q = p->next，q 指向待删除结点 C。", lineList(list, 2, { pointerLabels: { 1: "p", 2: "q" }, deleteIndex: 2 }), "q = C");
  addStep(steps, 3, "执行 p->next = q->next，让 B 越过 C，直接指向 D。", lineList(list, 1, { pointerLabels: { 1: "p", 2: "q" }, deleteIndex: 2, skipEdgeFrom: 1, note: "这一步完成了链表逻辑删除。" }), "B → D");
  addStep(steps, 4, "释放 q 结点空间。", lineList(["A", "B", "D", "E"], -1, { note: "C 已经从链表中断开。" }), "free(q)");
  addStep(steps, 5, "删除完成。408 常考指针顺序：先保存被删结点 q，再让 p 跳过 q，最后释放 q。", lineList(["A", "B", "D", "E"], -1), "A → B → D → E");
  return steps;
}

Object.assign(DEMO_LIBRARY, {
  avl_insert: {
    title: "AVL 插入旋转总览",
    category: "树 / AVL 平衡二叉树",
    code: [
      "BiTree InsertAVL(BiTree T, int key) {",
      "    if (T == NULL) return NewNode(key);",
      "    if (key < T->data) T->lchild = InsertAVL(T->lchild, key);",
      "    else if (key > T->data) T->rchild = InsertAVL(T->rchild, key);",
      "    UpdateHeight(T);",
      "    if (BF(T) > 1 && key < T->lchild->data) return RightRotate(T); // LL",
      "    if (BF(T) < -1 && key > T->rchild->data) return LeftRotate(T);  // RR",
      "    if (BF(T) > 1 && key > T->lchild->data) { T->lchild = LeftRotate(T->lchild); return RightRotate(T); } // LR",
      "    if (BF(T) < -1 && key < T->rchild->data) { T->rchild = RightRotate(T->rchild); return LeftRotate(T); } // RL",
      "    return T;",
      "}"
    ],
    examTips: ["AVL 平衡因子 BF = 左子树高度 - 右子树高度。", "LL 右旋，RR 左旋，LR 先左后右，RL 先右后左。", "旋转不改变中序序列，因此不会破坏 BST 性质。"],
    buildSteps: () => {
      const steps = [];
      addStep(steps, 0, "AVL 插入先按 BST 插入，再从插入点向上回溯，找第一个失衡结点。", avlState([{ id: "T", label: "T", x: 400, y: 120 }], [], { current: ["T"], note: "左侧目录可以分别选择 LL、RR、LR、RL 四种旋转。" }), "请选择具体旋转类型继续练习");
      for (const t of ["LL", "RR", "LR", "RL"]) {
        addStep(steps, 4, `${t} 型判断口诀：${t === "LL" ? "左左右旋" : t === "RR" ? "右右左旋" : t === "LR" ? "左右双旋" : "右左双旋"}。`, buildAvlCaseSteps(t)[2].state, `${t} 型`);
      }
      return steps;
    }
  },
  avl_ll: {
    title: "AVL LL 型插入旋转",
    category: "树 / AVL / LL 型",
    code: [
      "// LL：插入到失衡结点左孩子的左子树",
      "T->lchild = InsertAVL(T->lchild, key);",
      "UpdateHeight(T);",
      "if (BF(T) > 1 && key < T->lchild->data)",
      "    return RightRotate(T);",
      "// 口诀：左左右旋"
    ],
    examTips: ["LL 型只需要一次右旋。", "最小失衡子树的新根是原左孩子。", "旋转后中序序列不变。"],
    buildSteps: () => buildAvlCaseSteps("LL"),
  },
  avl_rr: {
    title: "AVL RR 型插入旋转",
    category: "树 / AVL / RR 型",
    code: [
      "// RR：插入到失衡结点右孩子的右子树",
      "T->rchild = InsertAVL(T->rchild, key);",
      "UpdateHeight(T);",
      "if (BF(T) < -1 && key > T->rchild->data)",
      "    return LeftRotate(T);",
      "// 口诀：右右左旋"
    ],
    examTips: ["RR 型只需要一次左旋。", "最小失衡子树的新根是原右孩子。", "RR 和 LL 正好对称。"],
    buildSteps: () => buildAvlCaseSteps("RR"),
  },
  avl_lr: {
    title: "AVL LR 型插入旋转",
    category: "树 / AVL / LR 型",
    code: [
      "// LR：插入到失衡结点左孩子的右子树",
      "T->lchild = InsertAVL(T->lchild, key);",
      "UpdateHeight(T);",
      "if (BF(T) > 1 && key > T->lchild->data) {",
      "    T->lchild = LeftRotate(T->lchild);",
      "    return RightRotate(T);",
      "}",
      "// 口诀：左右，先左后右"
    ],
    examTips: ["LR 型需要两次旋转：先对左孩子左旋，再对失衡结点右旋。", "中间关键字最后成为子树根。", "LR 和 RL 是双旋。"],
    buildSteps: () => buildAvlCaseSteps("LR"),
  },
  avl_rl: {
    title: "AVL RL 型插入旋转",
    category: "树 / AVL / RL 型",
    code: [
      "// RL：插入到失衡结点右孩子的左子树",
      "T->rchild = InsertAVL(T->rchild, key);",
      "UpdateHeight(T);",
      "if (BF(T) < -1 && key < T->rchild->data) {",
      "    T->rchild = RightRotate(T->rchild);",
      "    return LeftRotate(T);",
      "}",
      "// 口诀：右左，先右后左"
    ],
    examTips: ["RL 型需要两次旋转：先对右孩子右旋，再对失衡结点左旋。", "中间关键字最后成为子树根。", "判断类型一定围绕“最小失衡结点”。"],
    buildSteps: () => buildAvlCaseSteps("RL"),
  },
  infix_to_postfix: {
    title: "复杂中缀转后缀：运算符栈",
    category: "表达式 / 栈应用",
    code: [
      "for each token x in expression:",
      "    if x is operand: output(x);",
      "    else if x == '(' : push(opStack, x);",
      "    else if x == ')' :",
      "        while top != '(' : output(pop(opStack));",
      "        pop '(';",
      "    else:",
      "        while top priority >= x priority:",
      "            output(pop(opStack));",
      "        push(opStack, x);",
      "while opStack not empty: output(pop(opStack));"
    ],
    examTips: ["复杂表达式也按同一套规则：操作数直接输出，运算符比较优先级。", "括号只控制弹栈范围，括号本身不进入后缀表达式。", "同级左结合运算符要先弹出栈顶。"],
    buildSteps: buildInfixToPostfixStepsComplex,
  },
  expression_two_stack: {
    title: "表达式求值：操作数栈 + 运算符栈",
    category: "表达式 / 双栈法",
    code: [
      "for each token x:",
      "    if x is number: push(nums, x);",
      "    else if x == '(' : push(ops, x);",
      "    else if x == ')' : compute until '(';",
      "    else:",
      "        while priority(top(ops)) >= priority(x): compute once;",
      "        push(ops, x);",
      "compute remaining operators;",
      "return top(nums);"
    ],
    examTips: ["双栈法能直观看出中缀表达式求值过程。", "操作数栈保存数字或中间结果，运算符栈保存暂时不能计算的运算符。", "右括号和低优先级运算符都会触发计算。"],
    buildSteps: buildExpressionTwoStackSteps,
  },
  expr_tree_convert: {
    title: "复杂表达式三式互转：画树法",
    category: "表达式 / 二叉树应用",
    code: [
      "for each token x in postfix:",
      "    if x is operand: push(new leaf x);",
      "    else:",
      "        right = pop();",
      "        left = pop();",
      "        push(new tree x(left, right));",
      "preorder  -> prefix;",
      "inorder   -> infix;",
      "postorder -> postfix;"
    ],
    examTips: ["表达式树根是最后参与运算的运算符。", "由后缀建树时，先弹出的是右孩子，后弹出的是左孩子。", "前序=前缀，中序=中缀，后序=后缀。"],
    buildSteps: buildExprTreeConvertStepsComplex,
  },
  seq_list_insert: {
    title: "顺序表插入",
    category: "线性结构 / 顺序表",
    code: [
      "bool ListInsert(SqList &L, int i, ElemType x) {",
      "    if (i < 0 || i > L.length || L.length == MaxSize) return false;",
      "    for (int j = L.length; j > i; j--)",
      "        L.data[j] = L.data[j - 1];",
      "    L.data[i] = x;",
      "    L.length++;",
      "    return true;",
      "}"
    ],
    examTips: ["顺序表插入要从后往前移动，避免覆盖数据。", "平均移动次数约为 n/2。", "顺序表支持随机访问，但插入删除需要移动元素。"],
    buildSteps: buildSeqListInsertSteps,
  },
  seq_list_delete: {
    title: "顺序表删除",
    category: "线性结构 / 顺序表",
    code: [
      "bool ListDelete(SqList &L, int i, ElemType &e) {",
      "    if (i < 0 || i >= L.length) return false;",
      "    e = L.data[i];",
      "    for (int j = i; j < L.length - 1; j++)",
      "        L.data[j] = L.data[j + 1];",
      "    L.length--;",
      "    return true;",
      "}"
    ],
    examTips: ["顺序表删除要从前往后移动。", "平均移动次数约为 (n-1)/2。", "删除逻辑位置 i 后，原 i+1 位置开始依次前移。"],
    buildSteps: buildSeqListDeleteSteps,
  },
  linked_insert: {
    title: "单链表插入",
    category: "线性结构 / 单链表",
    code: [
      "bool LinkInsert(LinkList &L, int i, ElemType x) {",
      "    p = GetElem(L, i - 1);",
      "    s = new LNode; s->data = x;",
      "    s->next = p->next;",
      "    p->next = s;",
      "    return true;",
      "}"
    ],
    examTips: ["单链表插入不需要移动元素。", "必须先 s->next = p->next，再 p->next = s，否则后继链可能丢失。", "按位插入需要先查找前驱，时间复杂度 O(n)。"],
    buildSteps: buildLinkedInsertStepsBetter,
  },
  linked_delete: {
    title: "单链表删除",
    category: "线性结构 / 单链表",
    code: [
      "bool LinkDelete(LinkList &L, int i, ElemType &e) {",
      "    p = GetElem(L, i - 1);",
      "    q = p->next;",
      "    e = q->data;",
      "    p->next = q->next;",
      "    free(q);",
      "    return true;",
      "}"
    ],
    examTips: ["单链表删除要先保存被删结点 q。", "核心语句是 p->next = q->next。", "按位删除同样需要先查找前驱，时间复杂度 O(n)。"],
    buildSteps: buildLinkedDeleteSteps,
  },
});

// ===== 408 专题增强：图存储/AOE/关键路径/哈夫曼/线索二叉树/并查集/KMP =====
function dsSet(items, keyFn = x => x) { return new Set((items || []).map(keyFn)); }
function edgeKey(a, b) { return `${a}->${b}`; }
function edgeKeyU(a, b) { return [a, b].sort().join("--"); }
function dsGraphSvg(nodes, edges, opt = {}) {
  const nodeMap = Object.fromEntries(nodes.map(n => [n.id, n]));
  const active = dsSet(opt.activeNodes || []);
  const visited = dsSet(opt.visitedNodes || []);
  const target = dsSet(opt.targetNodes || []);
  const activeEdges = dsSet(opt.activeEdges || [], e => opt.undirected ? edgeKeyU(e.from, e.to) : edgeKey(e.from, e.to));
  const treeEdges = dsSet(opt.treeEdges || [], e => opt.undirected ? edgeKeyU(e.from, e.to) : edgeKey(e.from, e.to));
  const criticalEdges = dsSet(opt.criticalEdges || [], e => opt.undirected ? edgeKeyU(e.from, e.to) : edgeKey(e.from, e.to));
  const marker = opt.directed ? `<defs><marker id="arrow408" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L0,6 L9,3 z" fill="#9eb1cf"></path></marker><marker id="arrow408Active" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L0,6 L9,3 z" fill="#f59e0b"></path></marker><marker id="arrow408Crit" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L0,6 L9,3 z" fill="#ef4444"></path></marker></defs>` : "";
  const edgeEls = edges.map(e => {
    const a = nodeMap[e.from], b = nodeMap[e.to];
    if (!a || !b) return "";
    const k = opt.undirected ? edgeKeyU(e.from, e.to) : edgeKey(e.from, e.to);
    const cls = ["ds-edge"];
    if (treeEdges.has(k)) cls.push("tree");
    if (activeEdges.has(k)) cls.push("active");
    if (criticalEdges.has(k)) cls.push("critical");
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const markerEnd = opt.directed ? (criticalEdges.has(k) ? "url(#arrow408Crit)" : activeEdges.has(k) ? "url(#arrow408Active)" : "url(#arrow408)") : "";
    const line = `<line class="${cls.join(" ")}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" ${markerEnd ? `marker-end="${markerEnd}"` : ""}></line>`;
    const label = e.w !== undefined || e.label ? `<text class="ds-edge-label" x="${mx}" y="${my - 7}">${escapeHtml(e.label || e.w)}</text>` : "";
    return line + label;
  }).join("");
  const nodeEls = nodes.map(n => {
    const cls = ["ds-node"];
    if (visited.has(n.id)) cls.push("visited");
    if (active.has(n.id)) cls.push("current");
    if (target.has(n.id)) cls.push("target");
    return `<g class="${cls.join(" ")}" transform="translate(${n.x},${n.y})"><circle r="23"></circle><text>${escapeHtml(n.label || n.id)}</text></g>`;
  }).join("");
  return `<svg class="ds-svg" viewBox="0 0 760 250">${marker}${edgeEls}${nodeEls}</svg>`;
}

function dsTable(headers, rows, opt = {}) {
  const activeCells = dsSet(opt.activeCells || [], c => `${c[0]},${c[1]}`);
  const visitedCells = dsSet(opt.visitedCells || [], c => `${c[0]},${c[1]}`);
  const pathCells = dsSet(opt.pathCells || [], c => `${c[0]},${c[1]}`);
  const th = headers.map((h, j) => `<th class="${(opt.activeCols || []).includes(j) ? "active" : ""}">${escapeHtml(h)}</th>`).join("");
  const body = rows.map((r, i) => `<tr>${r.map((v, j) => {
    const key = `${i},${j}`;
    const cls = [];
    if ((opt.activeRows || []).includes(i)) cls.push("active");
    if (activeCells.has(key)) cls.push("active");
    if (visitedCells.has(key)) cls.push("visited");
    if (pathCells.has(key)) cls.push("path");
    return `<td class="${cls.join(" ")}">${escapeHtml(v)}</td>`;
  }).join("")}</tr>`).join("");
  return `<table class="ds-table"><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table>`;
}

function dsMatrix(labels, matrix, opt = {}) {
  const headers = [""].concat(labels);
  const rows = labels.map((lab, i) => [lab].concat(matrix[i].map(x => x === Infinity ? "∞" : x)));
  const activeRows = (opt.activeRows || []).map(i => i);
  const activeCols = (opt.activeCols || []).map(j => j + 1);
  const activeCells = (opt.activeCells || []).map(([i, j]) => [i, j + 1]);
  return dsTable(headers, rows, { activeRows, activeCols, activeCells, visitedCells: opt.visitedCells, pathCells: opt.pathCells });
}

function dsAdjList(labels, list, opt = {}) {
  const activeHeads = dsSet(opt.activeHeads || []);
  const activeItems = dsSet(opt.activeItems || [], x => `${x[0]}:${x[1]}`);
  const visited = dsSet(opt.visitedItems || [], x => `${x[0]}:${x[1]}`);
  return `<div class="ds-list">${labels.map(label => {
    const items = (list[label] || []).map(to => {
      const key = `${label}:${to}`;
      const cls = ["ds-list-node"];
      if (activeItems.has(key)) cls.push("active");
      if (visited.has(key)) cls.push("visited");
      return `<span class="${cls.join(" ")}">${escapeHtml(to)}</span>`;
    }).join(`<span class="ds-parent-arrow">→</span>`);
    const headCls = activeHeads.has(label) ? "ds-list-head active" : "ds-list-head";
    return `<div class="ds-list-row"><span class="${headCls}">${escapeHtml(label)}</span><span class="ds-parent-arrow">→</span>${items || `<span class="muted">NULL</span>`}</div>`;
  }).join("")}</div>`;
}

function dsChips(items, active = [], visited = [], danger = []) {
  const a = dsSet(active), v = dsSet(visited), d = dsSet(danger);
  return `<div class="ds-chip-row">${items.map(x => {
    const cls = ["ds-chip"];
    if (a.has(x)) cls.push("active");
    if (v.has(x)) cls.push("visited");
    if (d.has(x)) cls.push("danger");
    return `<span class="${cls.join(" ")}">${escapeHtml(x)}</span>`;
  }).join("")}</div>`;
}

function dsArrayCells(values, opt = {}) {
  const active = dsSet(opt.active || []), match = dsSet(opt.match || []), fail = dsSet(opt.fail || []);
  return `<div class="ds-array">${values.map((v, i) => {
    const cls = ["ds-arr-cell"];
    if (active.has(i)) cls.push("active");
    if (match.has(i)) cls.push("match");
    if (fail.has(i)) cls.push("fail");
    return `<span class="${cls.join(" ")}" data-index="${i}">${escapeHtml(v)}</span>`;
  }).join("")}</div>`;
}

function dsLayout(leftTitle, leftHtml, rightBlocks, note = "") {
  return { kind: "custom", className: "custom-wide", html: `<div class="ds-grid-demo"><div class="ds-card"><h3>${escapeHtml(leftTitle)}</h3>${leftHtml}</div><div class="ds-tables">${rightBlocks.map(b => `<div class="ds-card"><h3>${escapeHtml(b.title)}</h3>${b.html}</div>`).join("")}${note ? `<div class="ds-card ds-mini-note">${escapeHtml(note)}</div>` : ""}</div></div>` };
}

const MATRIX_GRAPH_NODES = [
  { id: "A", x: 110, y: 80 }, { id: "B", x: 275, y: 50 }, { id: "C", x: 275, y: 180 },
  { id: "D", x: 480, y: 70 }, { id: "E", x: 560, y: 185 }
];
const MATRIX_GRAPH_EDGES = [
  { from: "A", to: "B" }, { from: "A", to: "C" }, { from: "B", to: "D" }, { from: "B", to: "E" },
  { from: "C", to: "E" }, { from: "D", to: "E" }
];
const MATRIX_LABELS = ["A", "B", "C", "D", "E"];
const MATRIX_VALUE = [
  [0,1,1,0,0], [1,0,0,1,1], [1,0,0,0,1], [0,1,0,0,1], [0,1,1,1,0]
];
const ADJ_LIST_VALUE = { A: ["B", "C"], B: ["A", "D", "E"], C: ["A", "E"], D: ["B", "E"], E: ["B", "C", "D"] };

function buildMatrixBFSSteps() {
  const steps = [];
  const queueSnaps = ["A", "B,C", "C,D,E", "D,E", "E", "空"];
  const visitedSnaps = [[], ["A"], ["A", "B"], ["A", "B", "C"], ["A", "B", "C", "D"], ["A", "B", "C", "D", "E"]];
  const active = ["A", "A", "B", "C", "D", "E"];
  const edges = [[], [{from:"A",to:"B"},{from:"A",to:"C"}], [{from:"B",to:"D"},{from:"B",to:"E"}], [{from:"C",to:"E"}], [{from:"D",to:"E"}], []];
  for (let s = 0; s < 6; s++) {
    const a = active[s];
    const i = MATRIX_LABELS.indexOf(a);
    addStep(steps, Math.min(s, 8), s === 0 ? "从 A 开始 BFS：先访问 A，并把 A 入队。" : `出队 ${a}，扫描邻接矩阵第 ${a} 行，找值为 1 且未访问的邻接点。`,
      dsLayout("邻接矩阵上的 BFS", dsGraphSvg(MATRIX_GRAPH_NODES, MATRIX_GRAPH_EDGES, { undirected: true, activeNodes: [a], visitedNodes: visitedSnaps[s], treeEdges: edges.slice(0, s + 1).flat() }), [
        { title: "邻接矩阵：当前扫描行会高亮", html: dsMatrix(MATRIX_LABELS, MATRIX_VALUE, { activeRows: [i], activeCells: MATRIX_VALUE[i].map((v,j)=>v?[i,j]:null).filter(Boolean) }) },
        { title: "BFS 辅助信息", html: `${dsChips([`队列 Q：${queueSnaps[s]}`, `visited：${visitedSnaps[s].join(" ") || "空"}`])}<p class="ds-mini-note">矩阵存储时判断是否相邻：看 A[i][j] 是否为 1；扫描一行需要 O(n)。</p>` }
      ]), s === 5 ? "访问序列：A B C D E" : `队列：${queueSnaps[s]}`);
  }
  return steps;
}

function buildMatrixDFSSteps() {
  const steps = [];
  const order = ["A", "B", "D", "E", "C"];
  const stackSnaps = ["A", "A→B", "A→B→D", "A→B→D→E", "A→B→D→E→C", "回溯完成"];
  const treeEdges = [[], [{from:"A",to:"B"}], [{from:"A",to:"B"},{from:"B",to:"D"}], [{from:"A",to:"B"},{from:"B",to:"D"},{from:"D",to:"E"}], [{from:"A",to:"B"},{from:"B",to:"D"},{from:"D",to:"E"},{from:"E",to:"C"}], [{from:"A",to:"B"},{from:"B",to:"D"},{from:"D",to:"E"},{from:"E",to:"C"}]];
  for (let s = 0; s < 6; s++) {
    const current = order[Math.min(s, order.length - 1)];
    const i = MATRIX_LABELS.indexOf(current);
    addStep(steps, Math.min(s, 7), s === 0 ? "DFS 从 A 开始：访问 A，然后沿着第一个未访问邻接点一直深入。" : (s < 5 ? `当前递归到 ${current}，扫描邻接矩阵第 ${current} 行。` : "所有能到达的结点均访问完，递归逐层返回。"),
      dsLayout("邻接矩阵上的 DFS", dsGraphSvg(MATRIX_GRAPH_NODES, MATRIX_GRAPH_EDGES, { undirected: true, activeNodes: [current], visitedNodes: order.slice(0, Math.min(s + 1, 5)), treeEdges: treeEdges[s] }), [
        { title: "邻接矩阵：DFS 同样逐列扫描", html: dsMatrix(MATRIX_LABELS, MATRIX_VALUE, { activeRows: [i], activeCells: MATRIX_VALUE[i].map((v,j)=>v?[i,j]:null).filter(Boolean) }) },
        { title: "递归栈", html: dsChips([`栈：${stackSnaps[s]}`, `输出：${order.slice(0, Math.min(s + 1, 5)).join(" ")}`]) }
      ]), s === 5 ? "DFS 序列：A B D E C" : `递归栈：${stackSnaps[s]}`);
  }
  return steps;
}

function buildAdjListBFSSteps() {
  const steps = [];
  const rows = ["A", "B", "C", "D", "E"];
  const visited = [[], ["A"], ["A","B"], ["A","B","C"], ["A","B","C","D"], ["A","B","C","D","E"]];
  const queues = ["A", "B,C", "C,D,E", "D,E", "E", "空"];
  const activeEdges = [[], [{from:"A",to:"B"},{from:"A",to:"C"}], [{from:"B",to:"D"},{from:"B",to:"E"}], [], [], []];
  rows.forEach((r, idx) => {
    addStep(steps, Math.min(idx + 2, 8), `使用邻接表 BFS：出队 ${r}，只沿 ${r} 的边表扫描，不需要扫整行 n 个位置。`,
      dsLayout("邻接表上的 BFS", dsGraphSvg(MATRIX_GRAPH_NODES, MATRIX_GRAPH_EDGES, { undirected: true, activeNodes: [r], visitedNodes: visited[idx + 1], treeEdges: activeEdges.slice(0, idx + 1).flat() }), [
        { title: "邻接表：当前边表高亮", html: dsAdjList(MATRIX_LABELS, ADJ_LIST_VALUE, { activeHeads: [r], activeItems: (ADJ_LIST_VALUE[r] || []).map(x => [r, x]) }) },
        { title: "队列与输出", html: dsChips([`Q：${queues[idx + 1]}`, `visited：${visited[idx + 1].join(" ")}`]) }
      ]), `队列：${queues[idx + 1]}`);
  });
  return steps;
}

function buildAdjListDFSSteps() {
  const steps = [];
  const order = ["A", "B", "D", "E", "C"];
  const tree = [["A","B"],["B","D"],["D","E"],["E","C"]].map(([from,to])=>({from,to}));
  order.forEach((r, idx) => {
    addStep(steps, Math.min(idx + 1, 7), `DFS 访问 ${r}，在邻接表中找第一个未访问邻接点继续递归。`,
      dsLayout("邻接表上的 DFS", dsGraphSvg(MATRIX_GRAPH_NODES, MATRIX_GRAPH_EDGES, { undirected: true, activeNodes: [r], visitedNodes: order.slice(0, idx + 1), treeEdges: tree.slice(0, idx) }), [
        { title: "邻接表：只扫描当前顶点的边表", html: dsAdjList(MATRIX_LABELS, ADJ_LIST_VALUE, { activeHeads: [r], activeItems: (ADJ_LIST_VALUE[r] || []).map(x => [r, x]) }) },
        { title: "递归栈", html: dsChips([`stack：${order.slice(0, idx + 1).join("→")}`, `输出：${order.slice(0, idx + 1).join(" ")}`]) }
      ]), `DFS 当前输出：${order.slice(0, idx + 1).join(" ")}`);
  });
  addStep(steps, 8, "C 的邻接点都已经访问，递归回溯结束。", dsLayout("邻接表上的 DFS", dsGraphSvg(MATRIX_GRAPH_NODES, MATRIX_GRAPH_EDGES, { undirected: true, visitedNodes: order, treeEdges: tree }), [
    { title: "生成树边", html: dsChips(tree.map(e => `${e.from}-${e.to}`), [], tree.map(e => `${e.from}-${e.to}`)) },
    { title: "结论", html: `<p class="ds-mini-note">邻接表 DFS 时间复杂度 O(n+e)，比邻接矩阵更适合稀疏图。</p>` }
  ]), "DFS 序列：A B D E C");
  return steps;
}

const AOE_NODES = [
  { id: "v1", x: 70, y: 120 }, { id: "v2", x: 220, y: 65 }, { id: "v3", x: 220, y: 180 },
  { id: "v4", x: 410, y: 80 }, { id: "v5", x: 410, y: 190 }, { id: "v6", x: 620, y: 135 }
];
const AOE_EDGES = [
  { from: "v1", to: "v2", w: 3, label: "a1=3" }, { from: "v1", to: "v3", w: 2, label: "a2=2" },
  { from: "v2", to: "v4", w: 2, label: "a3=2" }, { from: "v2", to: "v5", w: 3, label: "a4=3" },
  { from: "v3", to: "v4", w: 4, label: "a5=4" }, { from: "v4", to: "v6", w: 2, label: "a6=2" },
  { from: "v5", to: "v6", w: 3, label: "a7=3" }
];
function aoeTable(ve = {}, vl = {}, active = []) {
  const labels = AOE_NODES.map(n => n.id);
  const rows = labels.map(v => [v, ve[v] ?? "?", vl[v] ?? "?"]);
  return dsTable(["顶点", "ve 最早发生", "vl 最迟发生"], rows, { activeRows: labels.map((v,i)=>active.includes(v)?i:-1).filter(i=>i>=0) });
}
function activityTable(activeEdges = [], criticalEdges = []) {
  const rows = [
    ["a1", "v1→v2", 0, 0, "是"], ["a2", "v1→v3", 0, 1, "否"], ["a3", "v2→v4", 3, 5, "否"],
    ["a4", "v2→v5", 3, 3, "是"], ["a5", "v3→v4", 2, 3, "否"], ["a6", "v4→v6", 6, 7, "否"], ["a7", "v5→v6", 6, 6, "是"]
  ];
  const activeRows = rows.map((r,i)=>activeEdges.includes(r[0])?i:-1).filter(i=>i>=0);
  const pathRows = rows.map((r,i)=>criticalEdges.includes(r[0])?i:-1).filter(i=>i>=0).map(i => [i,4]);
  return dsTable(["活动", "边", "e(i)", "l(i)", "关键?"], rows, { activeRows, pathCells: pathRows });
}
function buildAOESteps() {
  const steps = [];
  const ve0 = { v1: 0 };
  addStep(steps, 0, "AOE 网：顶点表示事件，边表示活动，边权表示活动持续时间。关键路径是从源点到汇点最长的路径。", dsLayout("AOE 网与关键路径", dsGraphSvg(AOE_NODES, AOE_EDGES, { directed: true, activeNodes: ["v1"] }), [
    { title: "ve/vl 表", html: aoeTable(ve0, {}, ["v1"]) },
    { title: "核心公式", html: `<p class="ds-mini-note">正向求 ve：ve[j] = max(ve[i] + w(i,j))<br>逆向求 vl：vl[i] = min(vl[j] - w(i,j))<br>活动 a 的 e=l 时，该活动是关键活动。</p>` }
  ]), "源点 v1 的 ve=0");
  const ve = { v1:0, v2:3, v3:2, v4:6, v5:6, v6:9 };
  addStep(steps, 2, "按拓扑序正向推 ve：v2=3，v3=2，v4=max(3+2,2+4)=6，v5=3+3=6，v6=max(6+2,6+3)=9。", dsLayout("正向计算最早发生时间 ve", dsGraphSvg(AOE_NODES, AOE_EDGES, { directed: true, visitedNodes: ["v1","v2","v3","v4","v5","v6"], activeEdges: AOE_EDGES }), [
    { title: "ve/vl 表", html: aoeTable(ve, {}, ["v6"]) },
    { title: "拓扑序", html: dsChips(["v1", "v2", "v3", "v4", "v5", "v6"], ["v6"], ["v1","v2","v3","v4","v5"]) }
  ]), "工程最短完成时间 = ve[v6] = 9");
  const vl = { v1:0, v2:3, v3:3, v4:7, v5:6, v6:9 };
  addStep(steps, 5, "从汇点逆拓扑序求 vl：先令 vl[v6]=ve[v6]=9，再反向取 min。", dsLayout("逆向计算最迟发生时间 vl", dsGraphSvg(AOE_NODES, AOE_EDGES, { directed: true, activeNodes: ["v6"], visitedNodes: ["v6"] }), [
    { title: "ve/vl 表", html: aoeTable(ve, vl, ["v1","v2","v3","v4","v5","v6"]) },
    { title: "逆拓扑序", html: dsChips(["v6", "v5", "v4", "v3", "v2", "v1"], ["v1"], ["v6","v5","v4","v3","v2"]) }
  ]), "vl 表计算完成");
  const crit = [{from:"v1",to:"v2"},{from:"v2",to:"v5"},{from:"v5",to:"v6"}];
  addStep(steps, 8, "计算每条活动的最早开始 e 和最迟开始 l，若 e=l，则该活动不能延误，是关键活动。", dsLayout("关键活动与关键路径", dsGraphSvg(AOE_NODES, AOE_EDGES, { directed: true, visitedNodes: AOE_NODES.map(n=>n.id), criticalEdges: crit }), [
    { title: "活动 e/l 表", html: activityTable([], ["a1","a4","a7"]) },
    { title: "结论", html: `<p class="ds-mini-note">关键路径：v1 → v2 → v5 → v6，总长度 3+3+3=9。关键路径上的活动延误，会直接导致整个工程延期。</p>` }
  ]), "关键路径：v1 → v2 → v5 → v6");
  return steps;
}

function buildGraphStorageSteps() {
  const steps = [];
  const matrixHtml = dsMatrix(MATRIX_LABELS, MATRIX_VALUE, { activeCells: [[0,1],[0,2]] });
  addStep(steps, 0, "邻接矩阵：用 n×n 矩阵存边。A[i][j]=1 表示 i 与 j 相邻，适合稠密图，判断两点是否有边是 O(1)。", dsLayout("图的存储结构：邻接矩阵", dsGraphSvg(MATRIX_GRAPH_NODES, MATRIX_GRAPH_EDGES, { undirected: true, activeNodes: ["A"], activeEdges: [{from:"A",to:"B"},{from:"A",to:"C"}] }), [
    { title: "邻接矩阵", html: matrixHtml },
    { title: "特点", html: `<p class="ds-mini-note">空间复杂度 O(n²)；无向图矩阵关于主对角线对称；求某顶点所有邻接点要扫描整行。</p>` }
  ]), "邻接矩阵：查边快，空间大");
  addStep(steps, 1, "邻接表：每个顶点挂一条边表，只保存存在的边，适合稀疏图。", dsLayout("图的存储结构：邻接表", dsGraphSvg(MATRIX_GRAPH_NODES, MATRIX_GRAPH_EDGES, { undirected: true, activeNodes: ["B"], activeEdges: [{from:"B",to:"A"},{from:"B",to:"D"},{from:"B",to:"E"}] }), [
    { title: "邻接表", html: dsAdjList(MATRIX_LABELS, ADJ_LIST_VALUE, { activeHeads:["B"], activeItems:[["B","A"],["B","D"],["B","E"]] }) },
    { title: "特点", html: `<p class="ds-mini-note">空间复杂度 O(n+e)；找一个顶点的邻接点方便；判断任意两点是否有边通常要扫描边表。</p>` }
  ]), "邻接表：省空间，适合稀疏图");
  const cross = `<div class="ds-list"><div class="ds-list-row"><span class="ds-list-head">v1</span><span class="ds-list-node active">firstin</span><span class="ds-parent-arrow">↓</span><span class="ds-list-node">入边链</span><span class="ds-list-node active">firstout</span><span class="ds-parent-arrow">→</span><span class="ds-list-node">出边链</span></div><div class="ds-list-row"><span class="ds-list-head">弧结点</span><span class="ds-list-node">tailvex</span><span class="ds-list-node">headvex</span><span class="ds-list-node">hlink</span><span class="ds-list-node">tlink</span></div></div>`;
  addStep(steps, 2, "十字链表：主要用于有向图。每条弧结点同时挂在“出边链”和“入边链”上，方便求入度、出度。", dsLayout("图的存储结构：十字链表", dsGraphSvg(AOE_NODES.slice(0,4), AOE_EDGES.slice(0,4), { directed:true, activeEdges:[AOE_EDGES[0]] }), [
    { title: "结构示意", html: cross },
    { title: "特点", html: `<p class="ds-mini-note">顶点结点含 firstin 和 firstout；弧结点含 tailvex、headvex、hlink、tlink。408 常考结构字段含义。</p>` }
  ]), "十字链表 = 有向图的链式存储");
  const multi = `<div class="ds-list"><div class="ds-list-row"><span class="ds-list-head">边结点</span><span class="ds-list-node active">ivex</span><span class="ds-list-node active">jvex</span><span class="ds-list-node">ilink</span><span class="ds-list-node">jlink</span></div><div class="ds-list-row"><span class="ds-list-head">顶点</span><span class="ds-list-node">firstedge</span><span class="ds-parent-arrow">→</span><span class="ds-list-node">所有关联边</span></div></div>`;
  addStep(steps, 3, "邻接多重表：主要用于无向图。每条边只存一个边结点，同时挂到两个端点的边链上。", dsLayout("图的存储结构：邻接多重表", dsGraphSvg(MATRIX_GRAPH_NODES.slice(0,4), MATRIX_GRAPH_EDGES.slice(0,3), { undirected:true, activeEdges:[{from:"A",to:"B"}] }), [
    { title: "结构示意", html: multi },
    { title: "特点", html: `<p class="ds-mini-note">适合无向图；删除边比普通邻接表方便；边结点字段 ivex、jvex、ilink、jlink 常考。</p>` }
  ]), "邻接多重表 = 无向图的链式存储");
  return steps;
}

function buildDFSForestSteps() {
  const steps = [];
  const nodes = [
    {id:"A",x:90,y:75},{id:"B",x:210,y:50},{id:"C",x:210,y:160},
    {id:"D",x:420,y:75},{id:"E",x:550,y:110},{id:"F",x:670,y:180}
  ];
  const edges = [{from:"A",to:"B"},{from:"A",to:"C"},{from:"B",to:"C"},{from:"D",to:"E"}];
  addStep(steps, 0, "非连通无向图做 DFS，需要从每个未访问顶点重新开始，因此得到的是深度优先生成森林。", dsLayout("DFS 生成森林与连通分量", dsGraphSvg(nodes, edges, {undirected:true}), [
    { title: "visited", html: dsChips(["A","B","C","D","E","F"]) },
    { title: "连通分量", html: `<p class="ds-mini-note">每从一个未访问顶点启动一次 DFS，就发现一个新的连通分量。</p>` }
  ]), "准备从 A 开始");
  addStep(steps, 1, "从 A 启动 DFS，访问 A-B-C，形成第一棵 DFS 树。", dsLayout("第一棵 DFS 树", dsGraphSvg(nodes, edges, {undirected:true, visitedNodes:["A","B","C"], treeEdges:[{from:"A",to:"B"},{from:"B",to:"C"}]}), [
    { title: "分量 1", html: dsChips(["A","B","C"], [], ["A","B","C"]) },
    { title: "生成树边", html: dsChips(["A-B", "B-C"], [], ["A-B","B-C"]) }
  ]), "连通分量 1：{A,B,C}");
  addStep(steps, 2, "扫描顶点表，发现 D 未访问，从 D 再启动一次 DFS，访问 D-E。", dsLayout("第二棵 DFS 树", dsGraphSvg(nodes, edges, {undirected:true, visitedNodes:["A","B","C","D","E"], treeEdges:[{from:"A",to:"B"},{from:"B",to:"C"},{from:"D",to:"E"}]}), [
    { title: "分量 2", html: dsChips(["D","E"], [], ["D","E"]) },
    { title: "森林", html: dsChips(["T1:{A,B,C}", "T2:{D,E}"], [], ["T1:{A,B,C}", "T2:{D,E}"]) }
  ]), "连通分量 2：{D,E}");
  addStep(steps, 3, "继续扫描，发现 F 未访问。F 没有边，单独构成第三个连通分量，也是一棵只有根的 DFS 树。", dsLayout("深度优先生成森林", dsGraphSvg(nodes, edges, {undirected:true, visitedNodes:["A","B","C","D","E","F"], treeEdges:[{from:"A",to:"B"},{from:"B",to:"C"},{from:"D",to:"E"}]}), [
    { title: "所有连通分量", html: dsChips(["{A,B,C}", "{D,E}", "{F}"], [], ["{A,B,C}", "{D,E}", "{F}"]) },
    { title: "结论", html: `<p class="ds-mini-note">无向图连通分量个数 = DFS/BFS 从未访问顶点启动的次数。</p>` }
  ]), "共有 3 个连通分量");
  return steps;
}

function buildHuffmanSteps() {
  const steps = [];
  const weights0 = ["a:5","b:9","c:12","d:13","e:16","f:45"];
  addStep(steps, 0, "哈夫曼树构造：每次从森林中选择权值最小的两棵树合并，新树权值为二者之和。", dsLayout("哈夫曼树构造", dsChips(weights0, ["a:5","b:9"]), [
    { title: "森林", html: dsChips(weights0, ["a:5","b:9"]) },
    { title: "规则", html: `<p class="ds-mini-note">权值越小的结点越靠近叶子深层，最终带权路径长度 WPL 最小。</p>` }
  ]), "选择 5 和 9");
  const forests = [
    ["c:12","d:13","ab:14","e:16","f:45"],
    ["ab:14","e:16","cd:25","f:45"],
    ["cd:25","abe:30","f:45"],
    ["f:45","cdabe:55"],
    ["root:100"]
  ];
  const descs = ["合并 a:5 与 b:9，得到 ab:14。", "合并 c:12 与 d:13，得到 cd:25。", "合并 ab:14 与 e:16，得到 abe:30。", "合并 cd:25 与 abe:30，得到 cdabe:55。", "合并 f:45 与 cdabe:55，得到根结点 100。"];
  forests.forEach((f, idx) => {
    addStep(steps, Math.min(idx + 2, 8), descs[idx], dsLayout("哈夫曼树构造", dsChips(f, [], idx < 4 ? [f[f.length-1]] : ["root:100"]), [
      { title: "当前森林", html: dsChips(f, [], idx < 4 ? [f[f.length-1]] : ["root:100"]) },
      { title: "合并次数", html: dsChips([`第 ${idx + 1} 次合并`, `森林棵数：${f.length}`]) }
    ]), descs[idx]);
  });
  const nodes = [
    {id:"100",label:"100",x:390,y:28},{id:"f",label:"f:45",x:250,y:86},{id:"55",label:"55",x:520,y:86},
    {id:"25",label:"25",x:420,y:148},{id:"30",label:"30",x:610,y:148},{id:"c",label:"c:12",x:360,y:210},{id:"d",label:"d:13",x:470,y:210},
    {id:"14",label:"14",x:555,y:210},{id:"e",label:"e:16",x:670,y:210},{id:"a",label:"a:5",x:520,y:240},{id:"b",label:"b:9",x:590,y:240}
  ];
  const edges = [{from:"100",to:"f",label:"0"},{from:"100",to:"55",label:"1"},{from:"55",to:"25",label:"0"},{from:"55",to:"30",label:"1"},{from:"25",to:"c",label:"0"},{from:"25",to:"d",label:"1"},{from:"30",to:"14",label:"0"},{from:"30",to:"e",label:"1"},{from:"14",to:"a",label:"0"},{from:"14",to:"b",label:"1"}];
  addStep(steps, 9, "给左分支标 0，右分支标 1，从根到叶子的 0/1 串就是哈夫曼编码。", dsLayout("哈夫曼编码", dsGraphSvg(nodes, edges, { directed:false, visitedNodes:nodes.map(n=>n.id) }), [
    { title: "编码表", html: `<div class="ds-huffman-code">f: 0<br>c: 100<br>d: 101<br>a: 1100<br>b: 1101<br>e: 111</div>` },
    { title: "性质", html: `<p class="ds-mini-note">哈夫曼编码是前缀编码：任一字符编码都不是另一个字符编码的前缀，因此可唯一译码。</p>` }
  ]), "哈夫曼编码生成完成");
  return steps;
}

const THREAD_NODES = [
  {id:"A",x:380,y:45},{id:"B",x:230,y:110},{id:"C",x:530,y:110},{id:"D",x:150,y:180},{id:"E",x:305,y:180},{id:"F",x:475,y:180}
];
const THREAD_EDGES = [{from:"A",to:"B"},{from:"A",to:"C"},{from:"B",to:"D"},{from:"B",to:"E"},{from:"C",to:"F"}];
function threadedTreeSvg(current = [], visited = [], threads = []) {
  const base = dsGraphSvg(THREAD_NODES, THREAD_EDGES, {undirected:false, activeNodes: current, visitedNodes: visited});
  const map = Object.fromEntries(THREAD_NODES.map(n=>[n.id,n]));
  const threadEls = threads.map(t => {
    const a = map[t.from], b = map[t.to]; if (!a || !b) return "";
    const cx = (a.x + b.x)/2, cy = Math.min(a.y,b.y)-35;
    return `<path class="ds-thread-line" d="M${a.x},${a.y} Q${cx},${cy} ${b.x},${b.y}"></path>`;
  }).join("");
  return base.replace("</svg>", `${threadEls}</svg>`);
}
function threadTable(order, threads = []) {
  const rows = order.map((x,i)=>[x, i===0?"前驱空":order[i-1], i===order.length-1?"后继空":order[i+1]]);
  return dsTable(["结点", "前驱线索", "后继线索"], rows, { activeRows: threads.map(t => order.indexOf(t.from)).filter(i=>i>=0) });
}
function buildThreadSteps(kind) {
  const orderMap = { inorder:["D","B","E","A","F","C"], preorder:["A","B","D","E","C","F"], postorder:["D","E","B","F","C","A"] };
  const titleMap = { inorder:"中序线索二叉树", preorder:"先序线索二叉树", postorder:"后序线索二叉树" };
  const order = orderMap[kind];
  const steps = [];
  addStep(steps, 0, `${titleMap[kind]}：按照“${kind === "inorder" ? "左-根-右" : kind === "preorder" ? "根-左-右" : "左-右-根"}”顺序遍历，把空左指针改为前驱线索，空右指针改为后继线索。`, dsLayout(titleMap[kind], threadedTreeSvg([], []), [
    { title: "遍历序列", html: dsChips(order) },
    { title: "线索规则", html: `<p class="ds-mini-note">ltag=1 表示 lchild 指向前驱；rtag=1 表示 rchild 指向后继。tag=0 仍表示孩子指针。</p>` }
  ]), `序列：${order.join(" ")}`);
  const threads = [];
  for (let i=0;i<order.length;i++) {
    const cur = order[i];
    const prev = i>0 ? order[i-1] : null;
    const next = i<order.length-1 ? order[i+1] : null;
    if (prev) threads.push({from:cur,to:prev});
    if (next) threads.push({from:cur,to:next});
    addStep(steps, Math.min(i+1, 8), `访问 ${cur}：pre 指向它的前驱 ${prev || "空"}，后继暂可由下一个访问结点 ${next || "空"} 确定。`, dsLayout(titleMap[kind], threadedTreeSvg([cur], order.slice(0,i+1), threads.slice(Math.max(0, threads.length-2))), [
      { title: "当前遍历进度", html: dsChips(order, [cur], order.slice(0,i)) },
      { title: "前驱/后继表", html: threadTable(order, threads.slice(Math.max(0, threads.length-2))) }
    ]), `当前结点：${cur}`);
  }
  addStep(steps, 7, `${titleMap[kind]} 构造完成。线索化的目的：利用原本为空的指针域，方便按某种遍历序列找前驱和后继。`, dsLayout(titleMap[kind], threadedTreeSvg([], order, []), [
    { title: "最终序列", html: dsChips(order, [], order) },
    { title: "前驱/后继关系", html: threadTable(order, []) }
  ]), "线索化完成");
  return steps;
}

function buildTreeFromSeqSteps(type) {
  const steps = [];
  const inorder = ["D","B","E","A","F","C"];
  const preorder = ["A","B","D","E","C","F"];
  const postorder = ["D","E","B","F","C","A"];
  const levelorder = ["A","B","C","D","E","F"];
  const name = type === "pre" ? "前序 + 中序" : type === "post" ? "后序 + 中序" : "层次 + 中序";
  const primary = type === "pre" ? preorder : type === "post" ? postorder : levelorder;
  addStep(steps, 0, `${name} 构造二叉树：中序序列负责划分左右子树，另一个序列负责确定根结点。`, dsLayout(`${name} 构造二叉树`, threadedTreeSvg([], []), [
    { title: "中序序列", html: dsChips(inorder) },
    { title: name.split(" + ")[0] + "序列", html: dsChips(primary) }
  ]), "先确定根，再切分左右子树");
  addStep(steps, 1, type === "pre" ? "前序第一个 A 是根。" : type === "post" ? "后序最后一个 A 是根。" : "层次序列中第一个出现在当前中序区间的结点 A 是根。", dsLayout("确定根结点 A", threadedTreeSvg(["A"], ["A"]), [
    { title: "中序切分", html: dsChips(["左子树: D B E", "根: A", "右子树: F C"], ["根: A"]) },
    { title: "规则", html: `<p class="ds-mini-note">在中序中，根左边属于左子树，根右边属于右子树。</p>` }
  ]), "根 = A");
  addStep(steps, 2, "递归构造左子树：左区间 D B E 的根是 B；继续切分得到 D 和 E。", dsLayout("构造左子树", threadedTreeSvg(["B"], ["A","B","D","E"]), [
    { title: "左子树中序", html: dsChips(["D", "B", "E"], ["B"]) },
    { title: "结果", html: dsChips(["B.left=D", "B.right=E"], [], ["B.left=D", "B.right=E"]) }
  ]), "左子树根 B");
  addStep(steps, 3, "递归构造右子树：右区间 F C 的根是 C，F 是 C 的左孩子。", dsLayout("构造右子树", threadedTreeSvg(["C"], ["A","B","C","D","E","F"]), [
    { title: "右子树中序", html: dsChips(["F", "C"], ["C"]) },
    { title: "结果", html: dsChips(["C.left=F", "C.right=NULL"], [], ["C.left=F"]) }
  ]), "右子树根 C");
  addStep(steps, 4, "二叉树构造完成后，可以再按中序进行线索化，得到中序线索二叉树。", dsLayout("构造完成并中序线索化", threadedTreeSvg([], ["A","B","C","D","E","F"]), [
    { title: "中序序列", html: dsChips(inorder, [], inorder) },
    { title: "线索化结果", html: threadTable(inorder, []) }
  ]), "可继续构造中序线索二叉树");
  return steps;
}

function buildTraversalCompareSteps() {
  const steps = [];
  const pre = ["A","B","D","E","C","F"], ino = ["D","B","E","A","F","C"], post = ["D","E","B","F","C","A"];
  const orders = [
    ["先序遍历", pre, "根 → 左 → 右"], ["中序遍历", ino, "左 → 根 → 右"], ["后序遍历", post, "左 → 右 → 根"]
  ];
  orders.forEach(([name, order, rule], idx) => {
    for (let i=0;i<order.length;i++) {
      addStep(steps, idx, `${name}：规则是 ${rule}。当前访问 ${order[i]}。`, dsLayout(name, threadedTreeSvg([order[i]], order.slice(0,i+1)), [
        { title: "访问规则", html: dsChips([rule], [rule]) },
        { title: "输出序列", html: dsChips(order, [order[i]], order.slice(0,i)) }
      ]), `${name} 输出：${order.slice(0,i+1).join(" ")}`);
    }
  });
  return steps;
}

function ufHtml(parent, active = []) {
  const headers = parent.map((_, i)=>String(i));
  const rows = [parent.map(x=>String(x))];
  return dsTable(headers, rows, { activeCols: active });
}
function ufForest(parent, active = []) {
  const chips = parent.map((p,i)=>`${i}→${p}`);
  return dsChips(chips, active.map(i=>`${i}→${parent[i]}`));
}
function buildUnionFindSteps() {
  const steps = [];
  let parent = [0,1,2,3,4,5];
  addStep(steps, 0, "并查集初始化：每个元素的 parent 指向自己，表示每个元素单独成一个集合。", dsLayout("并查集 Union-Find", ufForest(parent), [
    { title: "parent 数组", html: ufHtml(parent) },
    { title: "操作序列", html: dsChips(["Union(1,2)", "Union(3,4)", "Union(2,4)", "Find(4)"]) }
  ]), "初始 6 个集合");
  parent[2] = 1;
  addStep(steps, 2, "Union(1,2)：找到 1 和 2 的根，令其中一个根指向另一个根。", dsLayout("合并 1 和 2", ufForest(parent, [1,2]), [
    { title: "parent 数组", html: ufHtml(parent, [1,2]) },
    { title: "集合", html: dsChips(["{1,2}", "{0}", "{3}", "{4}", "{5}"], [], ["{1,2}"]) }
  ]), "parent[2]=1");
  parent[4] = 3;
  addStep(steps, 2, "Union(3,4)：把 4 合并到 3 所在集合。", dsLayout("合并 3 和 4", ufForest(parent, [3,4]), [
    { title: "parent 数组", html: ufHtml(parent, [3,4]) },
    { title: "集合", html: dsChips(["{1,2}", "{3,4}", "{0}", "{5}"], [], ["{3,4}"]) }
  ]), "parent[4]=3");
  parent[3] = 1;
  addStep(steps, 3, "Union(2,4)：Find(2)=1，Find(4)=3，所以把根 3 接到根 1 下。", dsLayout("合并两个集合", ufForest(parent, [2,4,1,3]), [
    { title: "parent 数组", html: ufHtml(parent, [1,2,3,4]) },
    { title: "集合", html: dsChips(["{1,2,3,4}", "{0}", "{5}"], [], ["{1,2,3,4}"]) }
  ]), "parent[3]=1");
  parent[4] = 1;
  addStep(steps, 6, "Find(4) 路径压缩：4→3→1，查找根后直接令 parent[4]=1，之后再查 4 会更快。", dsLayout("路径压缩", ufForest(parent, [4,1]), [
    { title: "parent 数组", html: ufHtml(parent, [4]) },
    { title: "结论", html: `<p class="ds-mini-note">并查集常用于连通性判断、Kruskal 最小生成树。路径压缩 + 按秩合并后近似 O(1)。</p>` }
  ]), "Find(4)=1，路径压缩完成");
  return steps;
}

function kmpNextTable(pattern, next, active = []) {
  return dsTable(["i"].concat(pattern.map((_,i)=>i)), [["P[i]"].concat(pattern), ["next[i]"].concat(next.map(x=>x==null?"?":x))], { activeCols: active.map(i=>i+1) });
}
function buildKMPNextSteps() {
  const steps = [];
  const p = "ABABC".split("");
  const nexts = [0,0,1,2,0];
  for (let i=0;i<p.length;i++) {
    addStep(steps, i < 2 ? i : 4, i === 0 ? "next[0]=0：长度为 1 的模式串没有真前后缀。" : `计算 next[${i}]：看 P[0..${i}] 的最长相等真前缀和真后缀长度。`, dsLayout("KMP next 数组构造", dsArrayCells(p, {active:[i]}), [
      { title: "模式串与 next", html: kmpNextTable(p, nexts.map((x,idx)=>idx<=i?x:null), [i]) },
      { title: "理解", html: `<p class="ds-mini-note">这里使用前缀函数写法：next[i] 表示 P[0..i] 的最长相等真前后缀长度。失配时 j = next[j-1]。</p>` }
    ]), `当前 next：${nexts.slice(0,i+1).join(" ")}`);
  }
  return steps;
}
function buildKMPMatchSteps() {
  const steps = [];
  const text = "ABABABC".split("");
  const pat = "ABABC".split("");
  const next = [0,0,1,2,0];
  const states = [
    [0,0,true,"T[0]=A 与 P[0]=A 匹配，i、j 都后移。"], [1,1,true,"T[1]=B 与 P[1]=B 匹配。"],
    [2,2,true,"T[2]=A 与 P[2]=A 匹配。"], [3,3,true,"T[3]=B 与 P[3]=B 匹配。"],
    [4,4,false,"T[4]=A 与 P[4]=C 失配，j 不回到 0，而是跳到 next[3]=2。"],
    [4,2,true,"j=2 后，T[4]=A 与 P[2]=A 匹配。"], [5,3,true,"T[5]=B 与 P[3]=B 匹配。"], [6,4,true,"T[6]=C 与 P[4]=C 匹配，j 到达模式串末尾。"]
  ];
  states.forEach((st, idx) => {
    const [i,j,ok,desc] = st;
    addStep(steps, ok ? 4 : 5, desc, dsLayout("KMP 主串匹配", `<div class="ds-card"><h3>主串 T</h3>${dsArrayCells(text, {active:[i], match: ok?[i]:[], fail: ok?[]:[i]})}</div><div class="ds-card" style="margin-top:10px"><h3>模式串 P</h3>${dsArrayCells(pat, {active:[j], match: ok?[j]:[], fail: ok?[]:[j]})}</div>`, [
      { title: "next 数组", html: kmpNextTable(pat, next, [j]) },
      { title: "指针", html: dsChips([`i=${i}`, `j=${j}`, ok ? "匹配" : "失配回退"], ok ? ["匹配"] : ["失配回退"]) }
    ]), idx === states.length-1 ? "匹配成功，起始下标 = i-j = 2" : `i=${i}, j=${j}`);
  });
  return steps;
}

Object.assign(DEMO_LIBRARY, {
  graph_storage: {
    title: "图的四种存储结构",
    category: "图 / 存储结构",
    code: [
      "// 邻接矩阵：Edge[i][j] 表示 i 到 j 是否有边或权值",
      "int Edge[MAXV][MAXV];",
      "// 邻接表：每个顶点有一条边表",
      "typedef struct ArcNode { int adjvex; ArcNode *next; } ArcNode;",
      "// 十字链表：有向图，弧结点同时位于入边链和出边链",
      "typedef struct ArcBox { int tailvex, headvex; ArcBox *hlink, *tlink; } ArcBox;",
      "// 邻接多重表：无向图，一条边只存一个边结点",
      "typedef struct EBox { int ivex, jvex; EBox *ilink, *jlink; } EBox;"
    ],
    examTips: ["邻接矩阵适合稠密图，空间 O(n²)，判断两点是否相邻 O(1)。", "邻接表适合稀疏图，空间 O(n+e)，遍历邻接点方便。", "十字链表用于有向图，邻接多重表用于无向图。"],
    buildSteps: buildGraphStorageSteps,
  },
  graph_matrix_bfs: {
    title: "邻接矩阵 BFS 演示",
    category: "图 / 邻接矩阵 / BFS",
    code: ["void BFS_Matrix(MGraph G, int v) {", "    visit(v); visited[v] = true; EnQueue(Q, v);", "    while (!QueueEmpty(Q)) {", "        DeQueue(Q, v);", "        for (int w = 0; w < G.vexnum; w++)", "            if (G.Edge[v][w] && !visited[w]) {", "                visit(w); visited[w] = true;", "                EnQueue(Q, w);", "            }", "    }", "}"],
    examTips: ["邻接矩阵 BFS 扫描一个顶点的邻接点要遍历整行。", "BFS 需要队列，适合求无权图最短路径。", "时间复杂度通常按 O(n²) 记。"],
    buildSteps: buildMatrixBFSSteps,
  },
  graph_matrix_dfs: {
    title: "邻接矩阵 DFS 演示",
    category: "图 / 邻接矩阵 / DFS",
    code: ["void DFS_Matrix(MGraph G, int v) {", "    visit(v); visited[v] = true;", "    for (int w = 0; w < G.vexnum; w++)", "        if (G.Edge[v][w] && !visited[w])", "            DFS_Matrix(G, w);", "}"],
    examTips: ["DFS 的本质是递归/栈。", "邻接矩阵 DFS 仍要扫描整行。", "非连通图要从每个未访问顶点重新 DFS。"],
    buildSteps: buildMatrixDFSSteps,
  },
  graph_adjlist_bfs: {
    title: "邻接表 BFS 演示",
    category: "图 / 邻接表 / BFS",
    code: ["void BFS_AdjList(ALGraph G, int v) {", "    visit(v); visited[v] = true; EnQueue(Q, v);", "    while (!QueueEmpty(Q)) {", "        DeQueue(Q, v);", "        for (ArcNode *p = G.vertices[v].first; p; p = p->next) {", "            int w = p->adjvex;", "            if (!visited[w]) { visit(w); visited[w] = true; EnQueue(Q, w); }", "        }", "    }", "}"],
    examTips: ["邻接表 BFS 只遍历实际存在的边。", "时间复杂度 O(n+e)。", "稀疏图优先考虑邻接表。"],
    buildSteps: buildAdjListBFSSteps,
  },
  graph_adjlist_dfs: {
    title: "邻接表 DFS 演示",
    category: "图 / 邻接表 / DFS",
    code: ["void DFS_AdjList(ALGraph G, int v) {", "    visit(v); visited[v] = true;", "    for (ArcNode *p = G.vertices[v].first; p; p = p->next) {", "        int w = p->adjvex;", "        if (!visited[w]) DFS_AdjList(G, w);", "    }", "}"],
    examTips: ["邻接表 DFS 不需要扫描不存在的边。", "DFS 生成树由第一次访问新顶点的边构成。", "时间复杂度 O(n+e)。"],
    buildSteps: buildAdjListDFSSteps,
  },
  dfs_forest_components: {
    title: "DFS 生成树/森林与连通分量",
    category: "图 / DFS 应用",
    code: ["void DFSTraverse(Graph G) {", "    for (v = 0; v < G.vexnum; v++)", "        visited[v] = false;", "    for (v = 0; v < G.vexnum; v++)", "        if (!visited[v]) {", "            componentCount++;", "            DFS(G, v);", "        }", "}"],
    examTips: ["连通图 DFS 得到一棵生成树。", "非连通图 DFS 得到生成森林。", "无向图连通分量个数等于 DFS 重新启动次数。"],
    buildSteps: buildDFSForestSteps,
  },
  aoe_critical_path: {
    title: "AOE 网与关键路径",
    category: "图 / AOE / 关键路径",
    code: ["TopologicalOrder(G, topo);", "for each v in topo:", "    for each edge <v,w>:", "        ve[w] = max(ve[w], ve[v] + weight(v,w));", "vl[sink] = ve[sink];", "for each v in reverse(topo):", "    for each edge <v,w>:", "        vl[v] = min(vl[v], vl[w] - weight(v,w));", "for each activity <v,w>:", "    e = ve[v]; l = vl[w] - weight(v,w);", "    if (e == l) activity is critical;"],
    examTips: ["AOE 网中顶点是事件，边是活动。", "ve 正向取 max，vl 逆向取 min。", "活动 e=l 即关键活动；关键路径可能不止一条。"],
    buildSteps: buildAOESteps,
  },
  huffman_tree: {
    title: "哈夫曼树构造与哈夫曼编码",
    category: "树 / 哈夫曼树",
    code: ["while forest has more than one tree:", "    select two trees x,y with minimum weight;", "    z = new node;", "    z.weight = x.weight + y.weight;", "    z.left = x; z.right = y;", "    insert z into forest;", "// left edge = 0, right edge = 1", "code(leaf) = bits on path from root to leaf;"],
    examTips: ["哈夫曼树又叫最优二叉树，使 WPL 最小。", "构造时每次选两个最小权值合并。", "哈夫曼编码是前缀编码，可以唯一译码。"],
    buildSteps: buildHuffmanSteps,
  },
  threaded_inorder: {
    title: "中序线索二叉树构造",
    category: "树 / 线索二叉树",
    code: ["void InThread(TNode *p, TNode *&pre) {", "    if (p != NULL) {", "        InThread(p->lchild, pre);", "        if (p->lchild == NULL) { p->lchild = pre; p->ltag = 1; }", "        if (pre && pre->rchild == NULL) { pre->rchild = p; pre->rtag = 1; }", "        pre = p;", "        InThread(p->rchild, pre);", "    }", "}"],
    examTips: ["中序线索最常考。", "pre 始终指向刚访问过的前驱结点。", "线索化只改空指针，不改真实孩子指针。"],
    buildSteps: () => buildThreadSteps("inorder"),
  },
  threaded_preorder: {
    title: "先序线索二叉树构造",
    category: "树 / 线索二叉树",
    code: ["void PreThread(TNode *p, TNode *&pre) {", "    if (p != NULL) {", "        visit and thread p with pre;", "        pre = p;", "        if (p->ltag == 0) PreThread(p->lchild, pre);", "        if (p->rtag == 0) PreThread(p->rchild, pre);", "    }", "}"],
    examTips: ["先序线索要先处理根，再处理左右子树。", "递归左右子树前要注意 ltag/rtag，避免沿线索误走。", "先序序列：根-左-右。"],
    buildSteps: () => buildThreadSteps("preorder"),
  },
  threaded_postorder: {
    title: "后序线索二叉树构造",
    category: "树 / 线索二叉树",
    code: ["void PostThread(TNode *p, TNode *&pre) {", "    if (p != NULL) {", "        PostThread(p->lchild, pre);", "        PostThread(p->rchild, pre);", "        visit and thread p with pre;", "        pre = p;", "    }", "}"],
    examTips: ["后序线索按左-右-根处理。", "后序线索找后继比中序复杂，常需要父指针辅助。", "408 更常考中序线索，但要能区分三种顺序。"],
    buildSteps: () => buildThreadSteps("postorder"),
  },
  build_thread_pre_in: {
    title: "前序 + 中序构造二叉树并线索化",
    category: "树 / 序列构造 / 线索化",
    code: ["root = preorder[0];", "k = position(root in inorder);", "leftIn = inorder[0..k-1]; rightIn = inorder[k+1..];", "leftPre/rightPre are split by left subtree size;", "root.left = build(leftPre, leftIn);", "root.right = build(rightPre, rightIn);", "InThread(root, pre);"],
    examTips: ["前序第一个是根。", "中序负责划分左右子树。", "构造出普通二叉树后才能线索化。"],
    buildSteps: () => buildTreeFromSeqSteps("pre"),
  },
  build_thread_post_in: {
    title: "后序 + 中序构造二叉树并线索化",
    category: "树 / 序列构造 / 线索化",
    code: ["root = postorder[last];", "k = position(root in inorder);", "leftIn/rightIn are split by k;", "leftPost/rightPost are split by subtree size;", "root.left = build(leftPost, leftIn);", "root.right = build(rightPost, rightIn);", "InThread(root, pre);"],
    examTips: ["后序最后一个是根。", "仍然用中序划分左右子树。", "没有中序，仅前序+后序通常不能唯一确定普通二叉树。"],
    buildSteps: () => buildTreeFromSeqSteps("post"),
  },
  build_thread_level_in: {
    title: "层次 + 中序构造二叉树并线索化",
    category: "树 / 序列构造 / 线索化",
    code: ["root = first node in levelorder that appears in current inorder range;", "split inorder by root;", "filter levelorder to get leftLevel and rightLevel;", "root.left = build(leftLevel, leftIn);", "root.right = build(rightLevel, rightIn);", "InThread(root, pre);"],
    examTips: ["层次序列按从上到下、从左到右给出。", "层次+中序可以唯一构造二叉树。", "每次在当前中序区间中找层次序列最先出现的结点作为根。"],
    buildSteps: () => buildTreeFromSeqSteps("level"),
  },
  traversal_compare: {
    title: "三种遍历对比演示",
    category: "树 / 二叉树遍历",
    code: ["PreOrder(T): visit(T); PreOrder(T->lchild); PreOrder(T->rchild);", "InOrder(T): InOrder(T->lchild); visit(T); InOrder(T->rchild);", "PostOrder(T): PostOrder(T->lchild); PostOrder(T->rchild); visit(T);"],
    examTips: ["先序：根左右；中序：左根右；后序：左右根。", "给两种遍历构造二叉树时，通常必须有中序。", "遍历题一定先画树或标递归访问顺序。"],
    buildSteps: buildTraversalCompareSteps,
  },
  union_find: {
    title: "并查集：合并、查找、路径压缩",
    category: "集合 / 并查集",
    code: ["int Find(int x) {", "    if (parent[x] != x)", "        parent[x] = Find(parent[x]);", "    return parent[x];", "}", "void Union(int a, int b) {", "    int ra = Find(a), rb = Find(b);", "    if (ra != rb) parent[rb] = ra;", "}"],
    examTips: ["并查集用于判断两个元素是否属于同一集合。", "Kruskal 算法常用并查集判断加边是否成环。", "路径压缩会把查找路径上的结点直接挂到根上。"],
    buildSteps: buildUnionFindSteps,
  },
  kmp_next: {
    title: "KMP next 数组构造",
    category: "串 / KMP",
    code: ["next[0] = 0;", "for (i = 1, j = 0; i < m; i++) {", "    while (j > 0 && P[i] != P[j])", "        j = next[j - 1];", "    if (P[i] == P[j]) j++;", "    next[i] = j;", "}"],
    examTips: ["next 数组本质是最长相等真前后缀长度。", "失配时模式串右移，主串 i 不回退。", "不同教材 next 定义可能从 -1 或 0 开始，考试要看题目约定。"],
    buildSteps: buildKMPNextSteps,
  },
  kmp_match: {
    title: "KMP 模式匹配演示",
    category: "串 / KMP",
    code: ["for (i = 0, j = 0; i < n; i++) {", "    while (j > 0 && T[i] != P[j])", "        j = next[j - 1];", "    if (T[i] == P[j]) j++;", "    if (j == m) {", "        return i - m + 1;", "    }", "}"],
    examTips: ["KMP 的关键：主串指针 i 不回退。", "失配时 j = next[j-1]。", "时间复杂度 O(n+m)。"],
    buildSteps: buildKMPMatchSteps,
  },
});


// =========================
// 第五轮扩展：数组/特殊矩阵、散列表、外部排序、队列栈应用、复杂 KMP、复杂树构造
// =========================
function dsInfoBox(title, lines) {
  return `<div class="ds-mini-note"><b>${escapeHtml(title)}</b><br>${lines.map(x=>escapeHtml(x)).join('<br>')}</div>`;
}
function richTable(headers, rows, activeRows=[], activeCols=[], activeCells=[]) {
  return dsTable(headers, rows, {activeRows, activeCols, activeCells});
}
function compactTreeSvg(activeNodes = [], visitedNodes = [], activeEdges = [], threadEdges = []) {
  const nodes = [
    {id:'A',x:380,y:35},{id:'B',x:210,y:95},{id:'C',x:550,y:95},
    {id:'D',x:120,y:165},{id:'E',x:300,y:165},{id:'F',x:470,y:165},{id:'G',x:640,y:165},
    {id:'H',x:75,y:230},{id:'I',x:165,y:230},{id:'J',x:430,y:230}
  ];
  const edges = [
    {from:'A',to:'B'},{from:'A',to:'C'},{from:'B',to:'D'},{from:'B',to:'E'},
    {from:'C',to:'F'},{from:'C',to:'G'},{from:'D',to:'H'},{from:'D',to:'I'},{from:'F',to:'J'}
  ];
  const extra = threadEdges.map(e => ({...e, label:e.label || '线索'}));
  return dsGraphSvg(nodes, edges.concat(extra), {activeNodes, visitedNodes, activeEdges, directed:true}) +
    `<div class="ds-mini-note">示例树高度为 4：A 为第 1 层，H/I/J 位于第 4 层。真实孩子边表示树结构，线索边表示空指针改造成的前驱/后继线索。</div>`;
}
function buildHeight4BinaryTreeSteps() {
  const steps = [];
  const pre = 'A B D H I E C F J G'.split(' ');
  const ino = 'H D I B E A J F C G'.split(' ');
  const post = 'H I D E B J F G C A'.split(' ');
  const level = 'A B C D E F G H I J'.split(' ');
  const phases = [
    {line:0, active:['A'], visited:[], text:'前序第一个 A 是整棵树根；在中序中，A 左侧是左子树，右侧是右子树。', result:'根=A'},
    {line:1, active:['B','C'], visited:['A'], text:'中序被 A 划分为左子树 H D I B E 与右子树 J F C G；前序继续确定左右子树根 B、C。', result:'左根 B，右根 C'},
    {line:2, active:['D','E','F','G'], visited:['A','B','C'], text:'对子树递归：B 的中序左边是 D 子树，右边是 E；C 的左边是 F 子树，右边是 G。', result:'第三层：D E F G'},
    {line:3, active:['H','I','J'], visited:['A','B','C','D','E','F','G'], text:'继续递归到第 4 层：D 的孩子是 H、I；F 的左孩子是 J。树的高度达到 4。', result:'第四层：H I J'},
    {line:4, active:[], visited:['A','B','C','D','E','F','G','H','I','J'], text:'构造完成后，可以用三种遍历反查验证：前序看根，中序划左右，后序看根在最后。', result:`Pre=${pre.join(' ')}；In=${ino.join(' ')}；Post=${post.join(' ')}`}
  ];
  phases.forEach(p => addStep(steps, p.line, p.text, dsLayout('高度 4 二叉树构造', compactTreeSvg(p.active,p.visited), [
    {title:'已知序列', html:`${dsInfoBox('前序 + 中序可唯一构造', [`Pre：${pre.join(' ')}`, `In ：${ino.join(' ')}`])}${dsInfoBox('另外两个可校验序列', [`Post：${post.join(' ')}`, `Level：${level.join(' ')}`])}`},
    {title:'本步结论', html:dsChips([p.result], [], [p.result])}
  ]), p.result));
  return steps;
}
function buildTreeFromSeqStepsV2(kind) {
  const steps = [];
  const pre = 'A B D H I E C F J G'.split(' ');
  const ino = 'H D I B E A J F C G'.split(' ');
  const post = 'H I D E B J F G C A'.split(' ');
  const level = 'A B C D E F G H I J'.split(' ');
  const source = kind === 'pre' ? `Pre：${pre.join(' ')}` : kind === 'post' ? `Post：${post.join(' ')}` : `Level：${level.join(' ')}`;
  const phases = [
    ['A', ['A'], [], '先确定根 A，并用中序序列把左右子树区间切开。', 0],
    ['B/C', ['B','C'], ['A'], '分别确定左右子树根 B、C，再继续用中序区间划分。', 1],
    ['D/E/F/G', ['D','E','F','G'], ['A','B','C'], '第三层结点确定，左右子树框架已经成型。', 3],
    ['H/I/J', ['H','I','J'], ['A','B','C','D','E','F','G'], '继续递归得到第 4 层结点，避免例子过浅导致看不出递归区间。', 4],
    ['中序线索化', ['H','D','I'], ['A','B','C','D','E','F','G','H','I','J'], '构造普通二叉树后，按中序序列 H D I B E A J F C G 进行线索化。', 6]
  ];
  phases.forEach((p, idx) => {
    const thread = idx >= 4 ? [{from:'H',to:'D',label:'后继'},{from:'I',to:'B',label:'后继'},{from:'E',to:'A',label:'后继'}] : [];
    addStep(steps, p[4], p[3], dsLayout(`${kind==='pre'?'前序+中序':kind==='post'?'后序+中序':'层次+中序'} 构造并线索化`, compactTreeSvg(p[1], p[2], [], thread), [
      {title:'输入序列', html:`${dsInfoBox('构造依据', [source, `In：${ino.join(' ')}`])}`},
      {title:'递归切分', html:dsChips([`当前根/层：${p[0]}`, '左区间', '右区间'], [`当前根/层：${p[0]}`])},
      {title:'线索化提醒', html:`<p class="ds-mini-note">构造完成后再线索化。线索化不是重新建树，而是把空指针改成前驱/后继指针，并配合 ltag/rtag 标记。</p>`}
    ]), p[0]);
  });
  return steps;
}
function buildThreadStepsV2(order) {
  const seqMap = {
    inorder: 'H D I B E A J F C G'.split(' '),
    preorder:'A B D H I E C F J G'.split(' '),
    postorder:'H I D E B J F G C A'.split(' ')
  };
  const seq = seqMap[order];
  const steps = [];
  const threads = [];
  for (let i=0; i<seq.length; i++) {
    const cur=seq[i], pre=seq[i-1] || 'NULL', nxt=seq[i+1] || 'NULL';
    if (i>0 && i<6) threads.push({from:seq[i-1], to:cur, label:'后继'});
    addStep(steps, order==='inorder'? (i<2?2:4) : order==='preorder'?2:4,
      `${order==='inorder'?'中序':order==='preorder'?'先序':'后序'}访问 ${cur}：pre=${pre}。若 ${cur} 的某个孩子指针为空，就把它改成前驱/后继线索。`,
      dsLayout(`${order==='inorder'?'中序':order==='preorder'?'先序':'后序'}线索化，高度 4 示例`, compactTreeSvg([cur], seq.slice(0,i), [], threads.slice(-5)), [
        {title:'访问序列', html:dsChips(seq, [cur], seq.slice(0,i))},
        {title:'pre 指针', html:dsChips([`pre=${pre}`, `cur=${cur}`, `next=${nxt}`], [`cur=${cur}`])},
        {title:'ltag / rtag', html:`<p class="ds-mini-note">tag=0 表示指向真实孩子；tag=1 表示指向遍历前驱或后继。线索化只利用原来的空指针。</p>`}
      ]), `已访问：${seq.slice(0,i+1).join(' ')}`);
  }
  return steps;
}
function matrixIndexCard(title, formula, source, compressed, activeSource=[], activeCompressed=[]) {
  return dsLayout(title, `<div class="ds-card"><h3>原矩阵</h3>${source}</div><div style="height:8px"></div><div class="ds-card"><h3>压缩一维数组</h3>${compressed}</div>`, [
    {title:'下标公式', html:`<p class="ds-mini-note">${escapeHtml(formula)}</p>`},
    {title:'考法', html:`<p class="ds-mini-note">408 常考：给出 A[i][j]，让你计算压缩数组 k；或给出 k，反推 i、j。默认下标从 0 或 1 开始要看题目。</p>`}
  ]);
}
function makeMatrix(n, f){ return Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=>f(i,j))); }
function matrixToTable(mat, active=[]) {
  const labs = mat.map((_,i)=>`i=${i}`);
  return dsTable([''].concat(mat.map((_,i)=>`j=${i}`)), mat.map((r,i)=>[`i=${i}`].concat(r)), {activeCells:active.map(([i,j])=>[i,j+1])});
}
function buildSymmetricMatrixSteps(){
  const steps=[]; const M=makeMatrix(4,(i,j)=>String.fromCharCode(97+Math.min(i,j)*4+Math.max(i,j))); const arr=['a','b','c','d','f','g','h','k','l','p'];
  [[0,0],[2,0],[3,1],[3,3]].forEach(([i,j],idx)=>{ const k=i>=j?i*(i+1)/2+j:j*(j+1)/2+i; addStep(steps, idx<1?0:2, `对称矩阵 A[i][j]=A[j][i]，只存下三角。访问 A[${i}][${j}] 时先映射到下三角，再计算 k。`, matrixIndexCard('对称矩阵压缩存储', '下三角按行存储：若 i>=j，k=i(i+1)/2+j；否则 k=j(j+1)/2+i。', matrixToTable(M,[[i,j],[j,i]]), dsArrayCells(arr,{active:[k]})), `A[${i}][${j}] → k=${k}`); });
  return steps;
}
function buildTriangularMatrixSteps(){
  const steps=[]; const M=makeMatrix(4,(i,j)=> i>=j ? `a${i}${j}` : 'c'); const arr=['a00','a10','a11','a20','a21','a22','a30','a31','a32','a33','c'];
  [[0,3],[2,1],[3,2]].forEach(([i,j],idx)=>{ const k=i>=j?i*(i+1)/2+j:arr.length-1; addStep(steps, idx<1?1:2, `下三角矩阵：下三角逐行存储，上三角元素都相同，用一个常量 c 表示。`, matrixIndexCard('三角矩阵压缩存储', '下三角：i>=j 时 k=i(i+1)/2+j；i<j 时访问常量区 c。', matrixToTable(M,[[i,j]]), dsArrayCells(arr,{active:[k]})), `A[${i}][${j}] → ${i>=j?'k='+k:'常量 c'}`); });
  return steps;
}
function buildTriDiagonalSteps(){
  const steps=[]; const n=5; const M=makeMatrix(n,(i,j)=> Math.abs(i-j)<=1?`a${i}${j}`:'0'); const arr=[]; for(let i=0;i<n;i++){ for(let j=Math.max(0,i-1);j<=Math.min(n-1,i+1);j++) arr.push(`a${i}${j}`); }
  [[0,1],[2,1],[3,3],[4,2]].forEach(([i,j],idx)=>{ const k=2*i+j; const ok=Math.abs(i-j)<=1; addStep(steps, ok?2:3, `三对角矩阵只存主对角线及上下相邻两条对角线。A[${i}][${j}] ${ok?'在带状区域内，可以映射到一维数组。':'不在三条对角线内，值为 0，不需要存储。'}`, matrixIndexCard('三对角矩阵压缩存储', '0 基下标常用公式：k = 2i + j（仅 |i-j|<=1 时有效）。', matrixToTable(M,[[i,j]]), dsArrayCells(arr,{active:ok?[k]:[]})), ok?`A[${i}][${j}] → k=${k}`:'非零带外元素，直接为 0'); });
  return steps;
}
function buildSparseMatrixSteps(){
  const steps=[]; const triples=[]; const entries=[[0,3,8],[1,1,5],[2,4,7],[4,0,6],[4,3,9]]; const M=makeMatrix(5,()=>0); entries.forEach(e=>M[e[0]][e[1]]=e[2]);
  entries.forEach((e,idx)=>{ triples.push(e); addStep(steps, idx<1?0:2, `扫描稀疏矩阵，遇到非零元素 A[${e[0]}][${e[1]}]=${e[2]}，存入三元组表 (row, col, value)。`, dsLayout('稀疏矩阵三元组存储', matrixToTable(M,[[e[0],e[1]]]), [
    {title:'三元组表', html:dsTable(['row','col','value'], triples)},
    {title:'应用', html:`<p class="ds-mini-note">稀疏矩阵适合非零元素很少的场景，如图的稀疏邻接矩阵、推荐系统评分矩阵。常考三元组表转置、快速转置。</p>`}
  ]), `当前非零元素个数=${triples.length}`); });
  return steps;
}
function hashCells(size, values={}, active=[]) {
  const arr=Array.from({length:size},(_,i)=>values[i]===undefined?'空':values[i]);
  return `<div class="ds-array hash-array">${arr.map((v,i)=>`<span class="ds-arr-cell ${active.includes(i)?'active':''}" data-index="${i}">${escapeHtml(v)}</span>`).join('')}</div>`;
}
function buildHashFunctionSteps(){
  const steps=[]; const keys=[19,14,23,1,68,20,84,27];
  const rows=keys.map(k=>[k, `${k} % 11`, k%11]);
  addStep(steps,0,'散列函数把关键字映射成表地址。除留余数法是 408 最常考的构造方法。', dsLayout('散列函数构造', hashCells(11), [
    {title:'H(key)=key mod 11', html:dsTable(['key','计算','地址'],rows)},
    {title:'常见构造方法', html:dsChips(['直接定址法','数字分析法','平方取中法','折叠法','除留余数法'], ['除留余数法'])}
  ]),'重点记 H(key)=key mod p，p 通常取不大于表长的质数');
  return steps;
}
function buildHashLinearProbingSteps(){
  const steps=[]; const keys=[19,14,23,1,68,20,84,27]; const table={};
  keys.forEach((key,idx)=>{ let h=key%11, pos=h, probes=[h]; while(table[pos]!==undefined){ pos=(pos+1)%11; probes.push(pos);} table[pos]=key; addStep(steps, pos===h?1:4, `插入 ${key}：H(${key})=${h}${pos!==h?'，发生冲突，按线性探测依次检查 '+probes.join('→'): '，位置为空，直接放入。'}`, dsLayout('开放定址法：线性探测', hashCells(11,table,probes), [
      {title:'探测序列', html:dsChips(probes.map(x=>`d=${x}`), probes.map(x=>`d=${x}`))},
      {title:'公式', html:`<p class="ds-mini-note">Hi=(H(key)+i) mod m。优点是简单；缺点是容易产生一次聚集。</p>`}
    ]), `插入 ${key} 到地址 ${pos}`); });
  return steps;
}
function buildHashChainSteps(){
  const steps=[]; const keys=[19,14,23,1,68,20,84,27]; const bucket={};
  keys.forEach((key,idx)=>{ const h=key%7; (bucket[h] ||= []).push(key); const rows=Array.from({length:7},(_,i)=>[`bucket[${i}]`, (bucket[i]||[]).join(' → ') || 'NULL']); addStep(steps,1, `链地址法插入 ${key}：H(${key})=${h}，把关键字插入 bucket[${h}] 的链表中。`, dsLayout('链地址法解决冲突', dsTable(['桶','链表'],rows,{activeRows:[h]}), [
      {title:'本步桶', html:dsChips([`H=${h}`, `key=${key}`], [`H=${h}`])},
      {title:'特点', html:`<p class="ds-mini-note">链地址法适合装填因子较大时使用。查找长度取决于链长，考题常让你计算 ASL。</p>`}
    ]), `bucket[${h}]：${bucket[h].join(' → ')}`); });
  return steps;
}
function buildHashConflictCompareSteps(){
  const steps=[]; const methods=[['线性探测','Hi=(H+i)%m','简单，但有一次聚集'],['二次探测','Hi=(H±i²)%m','缓解聚集，要求表长/质数条件'],['链地址法','同地址挂链表','删除方便，常考 ASL'],['再散列法','冲突时换另一个 H2','计算量稍大']];
  methods.forEach((m,idx)=>addStep(steps,idx,`解决冲突方法：${m[0]}。考试要能根据题目给的规则手工插入并计算查找长度。`, dsLayout('散列冲突解决方法对比', dsTable(['方法','探测/存储规则','特点'],methods,{activeRows:[idx]}), [
    {title:'装填因子', html:`<p class="ds-mini-note">α = 表中记录数 / 散列表长度。α 越大，冲突概率越高，平均查找长度通常越大。</p>`},
    {title:'408 提醒', html:dsChips(['构造散列表','查找成功 ASL','查找失败 ASL','删除标记'], ['查找成功 ASL','查找失败 ASL'])}
  ]), m[0]));
  return steps;
}
function buildRadixSortSteps(){
  const steps=[]; let arr=[329,457,657,839,436,720,355]; const passes=[1,10,100];
  passes.forEach((base,idx)=>{ const buckets=Array.from({length:10},()=>[]); arr.forEach(x=>buckets[Math.floor(x/base)%10].push(x)); const rows=buckets.map((b,i)=>[i,b.join('，')||'空']); const collected=buckets.flat(); addStep(steps,idx===0?0:2, `按 ${base===1?'个位':base===10?'十位':'百位'} 分配：稳定地放入 0~9 号队列，再按桶号收集。`, dsLayout('基数排序 LSD', dsArrayCells(arr,{active:arr.map((_,i)=>i)}), [
      {title:'10 个桶/队列', html:dsTable(['桶','元素'],rows)},
      {title:'收集后', html:dsArrayCells(collected,{match:collected.map((_,i)=>i)})}
    ]), `收集结果：${collected.join(' ')}`); arr=collected; });
  return steps;
}
function runBlocks(blocks){ return blocks.map((b,i)=>`R${i+1}: ${b.join(' ')}`).join('<br>'); }
function buildExternalMergeSteps(){
  const steps=[]; const runs=[[5,17,29],[3,11,22],[8,13,31],[2,19,25]]; const merged=[2,3,5,8,11,13,17,19,22,25,29,31];
  addStep(steps,0,'外部排序不能一次把所有记录放入内存，先生成若干初始归并段。', dsLayout('外部排序：初始归并段', `<p class="ds-mini-note">${runBlocks(runs)}</p>`, [{title:'核心目标', html:dsChips(['减少趟数','减少磁盘 I/O','增加归并路数 k'], ['减少趟数','减少磁盘 I/O'])}]), `初始段数 r=${runs.length}`);
  addStep(steps,1,'多路平衡归并：每次从 k 个归并段当前最小值中选最小者输出。', dsLayout('4 路平衡归并', `<p class="ds-mini-note">${runBlocks(runs)}</p>`, [{title:'输出缓冲区', html:dsArrayCells(merged.slice(0,6),{match:[0,1,2,3,4,5]})},{title:'败者树作用',html:`<p class="ds-mini-note">败者树用于快速找 k 路中的最小关键字，每输出一个元素只需 O(log k) 调整。</p>`}]), '输出：2 3 5 8 11 13 ...');
  addStep(steps,2,'一趟归并结束后，多个有序段合成为一个更长的有序段。', dsLayout('归并完成', dsArrayCells(merged,{match:merged.map((_,i)=>i)}), [{title:'趟数公式', html:`<p class="ds-mini-note">若有 r 个初始归并段，k 路归并趟数约为 ⌈log_k r⌉。增加 k 可减少趟数，但需要更多缓冲区。</p>`}]), `最终有序：${merged.join(' ')}`);
  return steps;
}
function buildLoserTreeSteps(){
  const steps=[]; const keys=[5,3,8,2]; const names=['R1','R2','R3','R4']; const losers=['R3(8)','R1(5)','R2(3)'];
  addStep(steps,0,'败者树初始化：叶子是各归并段当前记录，内部结点保存比较失败者，根附近能快速得到胜者。', dsLayout('败者树初始化', dsTable(['归并段','当前关键字'],names.map((n,i)=>[n,keys[i]])), [{title:'内部败者', html:dsChips(losers, [], [])},{title:'胜者', html:dsChips(['R4(2)'], ['R4(2)'])}]), '最小者 R4=2');
  addStep(steps,1,'输出胜者 R4 的 2 后，只沿 R4 到根的路径重新比较，不需要重新比较所有路。', dsLayout('输出后调整', dsTable(['归并段','当前关键字'],[['R1',5],['R2',3],['R3',8],['R4',19]],{activeRows:[3]}), [{title:'新胜者', html:dsChips(['R2(3)'], ['R2(3)'])},{title:'复杂度', html:`<p class="ds-mini-note">k 路归并每输出一个元素，败者树调整 O(log k)。</p>`}]), '输出 2，下一胜者 3');
  return steps;
}
function buildOptimalMergeTreeSteps(){
  const steps=[]; let weights=[2,3,5,9,13]; const merges=[];
  while(weights.length>1){ weights.sort((a,b)=>a-b); const a=weights.shift(),b=weights.shift(); merges.push([a,b,a+b]); weights.push(a+b); const rows=merges.map((m,i)=>[i+1,`${m[0]} + ${m[1]}`,m[2]]); addStep(steps,1,`最佳归并树：每次选择两个长度最小的归并段合并，类似哈夫曼树，使总读写代价最小。`, dsLayout('最佳归并树 / 哈夫曼思想', dsTable(['步骤','合并','新段长度'],rows,{activeRows:[rows.length-1]}), [{title:'当前森林权值', html:dsChips(weights.map(String))},{title:'WPL 思想', html:`<p class="ds-mini-note">初始段长度越小越应放在更深处，总代价等价于带权路径长度。</p>`}]), `合并 ${a}+${b}=${a+b}`); }
  return steps;
}
function buildReplacementSelectionSteps(){
  const steps=[]; const input=[17,5,21,3,29,8,14,1,30]; let heap=[17,5,21], run=[], frozen=[];
  addStep(steps,0,'置换选择排序用内存中的最小堆生成比内存容量更长的初始归并段。', dsLayout('置换选择排序初始化', dsArrayCells(input,{active:[0,1,2]}), [{title:'内存堆', html:dsChips(heap.map(String), ['5'])},{title:'当前归并段', html:dsChips(['空'])}]), '初始堆容量=3');
  const actions=[['输出5，读入3；3<5，冻结到下一段',[17,21],[5],[3]],['输出17，读入29；29>=17，进入当前堆',[21,29],[5,17],[3]],['输出21，读入8；8<21，冻结',[29],[5,17,21],[3,8]],['输出29，读入14；14<29，冻结，当前段结束',[],[5,17,21,29],[3,8,14]]];
  actions.forEach((a,idx)=>addStep(steps,idx<2?2:4,a[0], dsLayout('置换选择：输出/冻结', dsChips(a[2].map(String), [], a[2].map(String)), [{title:'当前堆', html:dsChips(a[1].map(String), a[1].slice(0,1).map(String))},{title:'冻结区（下一段）', html:dsChips(a[3].map(String), [], a[3].map(String))}]), `当前段：${a[2].join(' ')}`));
  return steps;
}
function ringQueueHtml(data, front, rear, cap=6) {
  return `<div class="ds-array">${Array.from({length:cap},(_,i)=>`<span class="ds-arr-cell ${(i===front||i===rear)?'active':''}" data-index="${i}">${escapeHtml(data[i]??'空')}<br>${i===front?'F':''}${i===rear?'R':''}</span>`).join('')}</div>`;
}
function buildSequentialQueueSteps(){
  const steps=[]; const cap=6; let data={}; let f=0,r=0; const ops=[['EnQueue',10],['EnQueue',20],['EnQueue',30],['DeQueue'],['EnQueue',40],['EnQueue',50],['EnQueue',60]];
  ops.forEach((op,idx)=>{ if(op[0]==='EnQueue'){ data[r]=op[1]; r=(r+1)%cap; } else { delete data[f]; f=(f+1)%cap; } addStep(steps, op[0]==='EnQueue'?2:8, `${op[0]}${op[1]!==undefined?'('+op[1]+')':''}：顺序队列通常用循环队列避免“假溢出”。`, dsLayout('顺序循环队列', ringQueueHtml(data,f,r,cap), [{title:'指针', html:dsChips([`front=${f}`,`rear=${r}`,`元素个数=(rear-front+MaxSize)%MaxSize`], [`front=${f}`,`rear=${r}`])},{title:'判空/判满', html:`<p class="ds-mini-note">判空：front==rear；牺牲一个单元判满：(rear+1)%MaxSize==front。</p>`}]), `front=${f}, rear=${r}`); });
  return steps;
}
function buildLinkedQueueSteps(){
  const steps=[]; let q=[]; const ops=[['入队','A'],['入队','B'],['入队','C'],['出队'],['入队','D']];
  ops.forEach((op,idx)=>{ if(op[0]==='入队') q.push(op[1]); else q.shift(); addStep(steps,op[0]==='入队'?2:7, `${op[0]} ${op[1]||''}：链式队列用 front 指向头结点，rear 指向尾结点，入队改 rear，出队改 front->next。`, dsLayout('链式队列', dsChips(['front/head'].concat(q).concat(['rear']), q.length?[q[q.length-1]]:[], q), [{title:'队列内容', html:dsChips(q.length?q:['空'])},{title:'特点', html:`<p class="ds-mini-note">链队不需要预设最大容量，但要注意空队时 front 和 rear 都指向头结点。</p>`}]), `Q=${q.join(' → ') || '空'}`); });
  return steps;
}
function buildDequeSteps(){
  const steps=[]; let dq=[]; const ops=[['push_back','A'],['push_front','B'],['push_back','C'],['pop_front'],['push_front','D'],['pop_back']];
  ops.forEach((op,idx)=>{ if(op[0]==='push_back')dq.push(op[1]); if(op[0]==='push_front')dq.unshift(op[1]); if(op[0]==='pop_front')dq.shift(); if(op[0]==='pop_back')dq.pop(); addStep(steps,idx, `${op[0]}${op[1]?'('+op[1]+')':''}：双端队列两端都允许插入和删除。`, dsLayout('双端队列 Deque', dsChips(['队头'].concat(dq).concat(['队尾']), dq), [{title:'应用', html:dsChips(['滑动窗口','回文判断','0-1 BFS','撤销/重做'], ['滑动窗口'])},{title:'受限双端队列', html:`<p class="ds-mini-note">输入受限/输出受限双端队列也是考研常见概念题。</p>`}]), `Deque=${dq.join(' ↔ ') || '空'}`); });
  return steps;
}
function buildStackRecursionSteps(){
  const steps=[]; const calls=['Fact(4)','Fact(3)','Fact(2)','Fact(1)'];
  calls.forEach((c,idx)=>addStep(steps,1,`递归调用 ${c}：系统栈压入一个新的活动记录，保存参数、返回地址和局部变量。`, dsLayout('递归与系统栈', dsChips(calls.slice(0,idx+1).reverse(), [c]), [{title:'调用链', html:dsChips(calls.slice(0,idx+1), [c])},{title:'408 提醒', html:`<p class="ds-mini-note">递归本质上由系统栈支持。能写递归，也要能改写成显式栈的非递归算法。</p>`}]), `栈深度=${idx+1}`));
  [2,6,24].forEach((ret,idx)=>addStep(steps,3,`开始回退：子问题返回后，当前栈帧弹出，并把结果交给上一层。`, dsLayout('递归回退', dsChips(calls.slice(0,3-idx).reverse()), [{title:'返回值', html:dsChips([`当前返回 ${ret}`], [`当前返回 ${ret}`])}]), `返回值=${ret}`));
  return steps;
}
function buildBracketMatchingSteps(){
  const steps=[]; const chars='[ ( { } ) ]'.split(' '); const stack=[]; const pairs={')':'(',']':'[','}':'{'};
  chars.forEach((ch,idx)=>{ let ok=true; if('([{'.includes(ch)) stack.push(ch); else ok=stack.pop()===pairs[ch]; addStep(steps,'([{'.includes(ch)?2:5, `读入 ${ch}：${'([{'.includes(ch)?'左括号入栈。':'右括号必须与栈顶左括号匹配，匹配则弹栈。'}`, dsLayout('括号匹配', dsArrayCells(chars,{active:[idx],match:ok?[idx]:[],fail:ok?[]:[idx]}), [{title:'栈', html:dsChips(stack.length?stack.slice().reverse():['空'], stack.slice(-1))},{title:'规则', html:`<p class="ds-mini-note">扫描结束后栈为空且中途没有失配，则括号序列合法。</p>`}]), `stack=${stack.join(' ')||'空'}`); });
  return steps;
}
function linkHtml(nodes, active=[]) { return `<div class="ds-list-row">${nodes.map((n,i)=>`<span class="ds-list-node ${active.includes(i)?'active':''}">${escapeHtml(n)}</span>${i<nodes.length-1?'<span class="ds-parent-arrow">⇄</span>':''}`).join('')}</div>`; }
function buildDoublyLinkedSteps(){
  const steps=[]; const nodes=['A','B','C'];
  addStep(steps,0,'双链表每个结点有 prior 和 next，能从前往后，也能从后往前。', dsLayout('双链表结构', linkHtml(nodes), [{title:'结点结构', html:dsChips(['prior','data','next'])}]), 'A ⇄ B ⇄ C');
  addStep(steps,2,'在 B 后插入 X：先让 X 接住 C，再让 B 和 C 分别指向 X。注意四条指针修改顺序。', dsLayout('双链表插入', linkHtml(['A','B','X','C'],[1,2,3]), [{title:'指针修改', html:dsChips(['s->next=p->next','s->prior=p','p->next->prior=s','p->next=s'], ['s->next=p->next'])}]), 'A ⇄ B ⇄ X ⇄ C');
  addStep(steps,5,'删除 X：让前驱 B 的 next 指向后继 C，让后继 C 的 prior 指向 B。', dsLayout('双链表删除', linkHtml(['A','B','C'],[1,2]), [{title:'指针修改', html:dsChips(['p->prior->next=p->next','p->next->prior=p->prior','free(p)'], ['free(p)'])}]), 'A ⇄ B ⇄ C');
  return steps;
}
function buildCircularLinkedSteps(){
  const steps=[]; const ring=['A','B','C','D'];
  addStep(steps,0,'循环链表的最后一个结点 next 指回头结点或首元结点，适合需要循环扫描的场景。', dsLayout('循环单链表', `${linkHtml(ring)}<p class="ds-mini-note">D.next → A，形成环。</p>`, [{title:'特点', html:dsChips(['尾指针 rear','rear->next 为头','约瑟夫问题'], ['尾指针 rear'])}]), 'D.next=A');
  addStep(steps,2,'在尾结点 D 后插入 X：X->next = D->next，然后 D->next = X；若维护尾指针，rear = X。', dsLayout('循环链表尾插', `${linkHtml(['A','B','C','D','X'],[3,4])}<p class="ds-mini-note">X.next → A</p>`, [{title:'尾指针', html:dsChips(['rear=D','插入后 rear=X'], ['插入后 rear=X'])}]), '尾插完成');
  addStep(steps,5,'删除首元结点 A：rear->next = A->next，释放 A；循环链表删除也要避免断环。', dsLayout('循环链表删除', `${linkHtml(['B','C','D','X'])}<p class="ds-mini-note">X.next → B</p>`, [{title:'结果', html:dsChips(['B','C','D','X'], [], ['B','C','D','X'])}]), '删除 A');
  return steps;
}
function buildStaticLinkedSteps(){
  const steps=[]; const rows0=[[0,'','2'],[1,'C','-1'],[2,'A','3'],[3,'B','1'],[4,'备用','5'],[5,'备用','-1']];
  addStep(steps,0,'静态链表用数组模拟链表：每个数组单元存 data 和 next，下标充当“指针”。', dsLayout('静态链表', dsTable(['下标','data','next'],rows0), [{title:'逻辑链', html:dsChips(['2:A','3:B','1:C'], [], ['2:A','3:B','1:C'])},{title:'备用链', html:dsChips(['4','5'])}]), 'head=2');
  const rows1=[[0,'','2'],[1,'C','-1'],[2,'A','4'],[3,'B','1'],[4,'X','3'],[5,'备用','-1']];
  addStep(steps,3,'从备用链取下标 4 存 X，并把它插入 A 与 B 之间：4.next=3，2.next=4。', dsLayout('静态链表插入', dsTable(['下标','data','next'],rows1,{activeRows:[2,4]}), [{title:'逻辑链', html:dsChips(['2:A','4:X','3:B','1:C'], ['4:X'])}]), '插入 X');
  const rows2=[[0,'','2'],[1,'C','-1'],[2,'A','3'],[3,'B','1'],[4,'备用','5'],[5,'备用','-1']];
  addStep(steps,5,'删除 X：让前驱 2.next 重新指向 3，再把 4 归还备用链。', dsLayout('静态链表删除', dsTable(['下标','data','next'],rows2,{activeRows:[2,4]}), [{title:'逻辑链', html:dsChips(['2:A','3:B','1:C'])},{title:'备用链', html:dsChips(['4','5'], ['4'])}]), '删除 X');
  return steps;
}
function prefixTable(pattern, next, active=[]){ return dsTable(['i'].concat(pattern.map((_,i)=>i)), [['P[i]'].concat(pattern), ['next[i]'].concat(next.map(x=>x==null?'?':x))], {activeCols:active.map(i=>i+1)}); }
function computePrefix(p){ const next=Array(p.length).fill(0); let j=0; for(let i=1;i<p.length;i++){ while(j>0&&p[i]!==p[j]) j=next[j-1]; if(p[i]===p[j]) j++; next[i]=j;} return next; }
function buildKMPNextStepsV2(){
  const steps=[]; const p='ABABCABAA'.split(''); const next=computePrefix(p);
  for(let i=0;i<p.length;i++){ addStep(steps,i<2?1:(i%3===0?2:4), `复杂模式串 P=ABABCABAA：计算 next[${i}]，它表示 P[0..${i}] 的最长相等真前后缀长度。`, dsLayout('复杂 KMP next 构造', dsArrayCells(p,{active:[i]}), [{title:'next 表', html:prefixTable(p,next.map((x,idx)=>idx<=i?x:null),[i])},{title:'前后缀理解', html:`<p class="ds-mini-note">例如到 ABAB 时，最长相等真前后缀是 AB，长度为 2；失配时 j 直接跳到 next[j-1]。</p>`}]), `next：${next.slice(0,i+1).join(' ')}`); }
  return steps;
}
function buildKMPMatchStepsV2(){
  const steps=[]; const text='ABABABABCABAA'.split(''); const pat='ABABCABAA'.split(''); const next=computePrefix(pat); let i=0,j=0; let count=0;
  while(i<text.length && count<30){ const ok=text[i]===pat[j]; if(ok){ addStep(steps,3,`T[${i}]=${text[i]} 与 P[${j}]=${pat[j]} 匹配，i 和 j 同时后移。`, dsLayout('复杂 KMP 匹配', `<div class="ds-card"><h3>主串 T</h3>${dsArrayCells(text,{active:[i],match:[i]})}</div><div class="ds-card" style="margin-top:8px"><h3>模式串 P</h3>${dsArrayCells(pat,{active:[j],match:[j]})}</div>`, [{title:'next', html:prefixTable(pat,next,[j])},{title:'指针', html:dsChips([`i=${i}`,`j=${j}`,'匹配'], ['匹配'])}]), `i=${i}, j=${j}`); i++; j++; if(j===pat.length){ addStep(steps,5,'j 到达模式串末尾，匹配成功。主串指针从未回退。', dsLayout('匹配成功', dsArrayCells(text,{match:Array.from({length:pat.length},(_,k)=>i-pat.length+k)}), [{title:'匹配位置', html:dsChips([`start=${i-pat.length}`], [`start=${i-pat.length}`])}]), `起始下标=${i-pat.length}`); break;} } else { const old=j; const newj=j>0?next[j-1]:0; addStep(steps,1,`失配：T[${i}]=${text[i]}，P[${j}]=${pat[j]}。主串 i 不回退，j 从 ${old} 跳到 ${newj}。`, dsLayout('复杂 KMP 失配跳转', `<div class="ds-card"><h3>主串 T</h3>${dsArrayCells(text,{active:[i],fail:[i]})}</div><div class="ds-card" style="margin-top:8px"><h3>模式串 P</h3>${dsArrayCells(pat,{active:[j],fail:[j]})}</div>`, [{title:'next', html:prefixTable(pat,next,[Math.max(0,j-1)])},{title:'跳转', html:dsChips([`j=${old}`,`j=next[${old-1}]=${newj}`], [`j=next[${old-1}]=${newj}`])}]), `j ${old}→${newj}`); if(j>0) j=newj; else i++; } count++; }
  return steps;
}
function kmpProperPrefixSuffixHtml(p, i, lpsVal) {
  const sub = p.slice(0, i + 1).join('');
  const pairs = [];
  for (let len = 1; len <= i; len++) {
    const pre = p.slice(0, len).join('');
    const suf = p.slice(i + 1 - len, i + 1).join('');
    pairs.push([len, pre, suf, pre === suf ? '√' : '×']);
  }
  const longest = lpsVal > 0 ? p.slice(0, lpsVal).join('') : '无';
  const rows = pairs.length ? pairs : [[0, '无真前缀', '无真后缀', '—']];
  return `<div class="ds-mini-note"><b>当前子串：</b>${escapeHtml(sub)}<br><b>最长相等真前后缀：</b>${escapeHtml(longest)}，长度 = ${lpsVal}</div>` +
    dsTable(['长度', '真前缀', '真后缀', '是否相等'], rows, { activeRows: pairs.map((r, idx) => r[3] === '√' ? idx : -1).filter(x => x >= 0) });
}
function kmpNextValReasonHtml(p, i, nextArr, nextValArr, lps) {
  if (i === 0) {
    return `<p class="ds-mini-note">i=0 时没有真前后缀，约定 next[0] = -1，nextval[0] = -1。</p>`;
  }
  const k = nextArr[i];
  const lpsPrev = lps[i - 1];
  const compare = k >= 0 ? `比较 P[${i}]=${escapeHtml(p[i])} 与 P[next[${i}]]=P[${k}]=${escapeHtml(p[k])}` : 'next 为 -1，无需比较';
  const decision = k >= 0 && p[i] === p[k]
    ? `二者相同，若失配后跳到 ${k} 仍会再次失败，所以 nextval[${i}] = nextval[${k}] = ${nextValArr[i]}。`
    : `二者不同，可以直接跳到 ${k}，所以 nextval[${i}] = next[${i}] = ${nextValArr[i]}。`;
  return `<p class="ds-mini-note">next[${i}] = lps[${i - 1}] = ${lpsPrev}。${compare}。${decision}</p>`;
}
function buildKMPNextValSteps(){
  const steps=[];
  const p='ABABAAABABAA'.split('');
  const lps=computePrefix(p);
  const nextArr=[-1].concat(lps.slice(0,-1));
  const nextv=Array(p.length).fill(-1);
  for(let i=1;i<p.length;i++){
    const k=nextArr[i];
    if(k===-1) nextv[i] = -1;
    else if(p[i]!==p[k]) nextv[i] = k;
    else nextv[i] = nextv[k];
  }
  for(let i=0;i<p.length;i++){
    const show = (arr) => arr.map((x,k)=>k<=i?x:'?');
    addStep(steps, i===0 ? 2 : (i%3===0 ? 4 : 5),
      `先由 P[0..${i}] 求最长相等真前后缀长度 lps[${i}]，再对照得到 next，并根据 P[i] 与 P[next[i]] 是否相同求 nextval。`,
      dsLayout('KMP next / nextval 对照推导', dsArrayCells(p,{active:[i]}), [
        {title:'next 与 nextval 对照表', html:dsTable(['i'].concat(p.map((_,k)=>k)), [
          ['P[i]'].concat(p),
          ['lps长度'].concat(show(lps)),
          ['next[i]'].concat(show(nextArr)),
          ['nextval[i]'].concat(show(nextv))
        ], {activeCols:[i+1]})},
        {title:'最长相等真前后缀长度的求法', html:kmpProperPrefixSuffixHtml(p, i, lps[i])},
        {title:'由 next 推出 nextval', html:kmpNextValReasonHtml(p, i, nextArr, nextv, lps)},
        {title:'408 提醒', html:`<p class="ds-mini-note">本演示采用常见 408 写法：next[0] = -1，next[j] = lps[j-1]。有些教材使用 1 起始下标，数值会整体平移，核心思想不变。</p>`}
      ]),
      `lps[${i}]=${lps[i]}，next[${i}]=${nextArr[i]}，nextval[${i}]=${nextv[i]}`);
  }
  return steps;
}

Object.assign(DEMO_LIBRARY, {
  binary_tree_create: { ...DEMO_LIBRARY.binary_tree_create, title:'普通二叉树创建：高度 4 示例', buildSteps: buildHeight4BinaryTreeSteps },
  build_thread_pre_in: { ...DEMO_LIBRARY.build_thread_pre_in, title:'前序 + 中序构造高度 4 二叉树并线索化', buildSteps: () => buildTreeFromSeqStepsV2('pre') },
  build_thread_post_in: { ...DEMO_LIBRARY.build_thread_post_in, title:'后序 + 中序构造高度 4 二叉树并线索化', buildSteps: () => buildTreeFromSeqStepsV2('post') },
  build_thread_level_in: { ...DEMO_LIBRARY.build_thread_level_in, title:'层次 + 中序构造高度 4 二叉树并线索化', buildSteps: () => buildTreeFromSeqStepsV2('level') },
  threaded_inorder: { ...DEMO_LIBRARY.threaded_inorder, title:'中序线索二叉树构造：高度 4 示例', buildSteps: () => buildThreadStepsV2('inorder') },
  threaded_preorder: { ...DEMO_LIBRARY.threaded_preorder, title:'先序线索二叉树构造：高度 4 示例', buildSteps: () => buildThreadStepsV2('preorder') },
  threaded_postorder: { ...DEMO_LIBRARY.threaded_postorder, title:'后序线索二叉树构造：高度 4 示例', buildSteps: () => buildThreadStepsV2('postorder') },
  symmetric_matrix: { title:'对称矩阵压缩存储', category:'数组 / 特殊矩阵', code:['if (i >= j) k = i * (i + 1) / 2 + j;','else k = j * (j + 1) / 2 + i;','return B[k];'], examTips:['对称矩阵只需存上三角或下三角。','常考下标映射公式。','注意题目下标从 0 还是从 1 开始。'], buildSteps: buildSymmetricMatrixSteps },
  triangular_matrix: { title:'三角矩阵压缩存储', category:'数组 / 特殊矩阵', code:['if (i >= j) k = i * (i + 1) / 2 + j;','else return c;','return B[k];'], examTips:['三角矩阵只存非零三角区域，另一半用一个常量。','下三角和上三角公式不同。','压缩存储能把 O(n²) 降到约 n(n+1)/2。'], buildSteps: buildTriangularMatrixSteps },
  tridiagonal_matrix: { title:'三对角矩阵压缩存储', category:'数组 / 特殊矩阵', code:['if (abs(i - j) > 1) return 0;','k = 2 * i + j;','return B[k];'], examTips:['三对角矩阵又叫带状矩阵。','只存 3n-2 个元素。','常考公式 k=2i+j 的适用条件。'], buildSteps: buildTriDiagonalSteps },
  sparse_matrix: { title:'稀疏矩阵三元组表', category:'数组 / 特殊矩阵', code:['for i in rows:','  for j in cols:','    if A[i][j] != 0:','      triples.push(i, j, A[i][j]);'], examTips:['稀疏矩阵存三元组：行、列、值。','常考普通转置和快速转置。','图的稀疏邻接矩阵可用稀疏结构节省空间。'], buildSteps: buildSparseMatrixSteps },
  hash_functions: { title:'散列函数构造方法', category:'查找 / 散列表', code:['H(key) = key % p;','// p 通常取不大于表长的质数','addr = H(key);'], examTips:['除留余数法最常考。','p 的选择会影响冲突。','散列表查找性能与装填因子密切相关。'], buildSteps: buildHashFunctionSteps },
  hash_linear: { title:'散列表：线性探测法', category:'查找 / 散列表', code:['d = H(key);','while table[d] is occupied:','    d = (d + 1) % m;','table[d] = key;'], examTips:['线性探测容易一次聚集。','开放定址删除时通常需要删除标记。','常考成功/失败 ASL。'], buildSteps: buildHashLinearProbingSteps },
  hash_chain: { title:'散列表：链地址法', category:'查找 / 散列表', code:['d = H(key);','s = new Node(key);','s->next = bucket[d];','bucket[d] = s;'], examTips:['链地址法每个地址挂一个链表。','装填因子可以大于 1。','删除比开放定址更自然。'], buildSteps: buildHashChainSteps },
  hash_conflict_compare: { title:'解决散列冲突方法对比', category:'查找 / 散列表', code:['linear probing','quadratic probing','separate chaining','rehashing'], examTips:['掌握线性探测、二次探测、链地址法。','会手工构造散列表。','会计算 ASL。'], buildSteps: buildHashConflictCompareSteps },
  radix_sort: { title:'基数排序 LSD', category:'排序 / 分配类排序', code:['for d in lowest_digit to highest_digit:','    distribute records into 0..9 queues by digit d;','    collect queues from 0 to 9 stably;'], examTips:['基数排序是稳定排序。','适合关键字可分解为若干位。','时间复杂度常记 O(d(n+r))。'], buildSteps: buildRadixSortSteps },
  external_merge_sort: { title:'外部排序：多路平衡归并', category:'排序 / 外部排序', code:['generate initial runs;','while more than one run:','    k-way merge runs using buffers;','    write merged run to disk;'], examTips:['外部排序核心成本是磁盘 I/O。','增加归并路数 k 可以减少归并趟数。','归并段数 r 和 k 决定趟数。'], buildSteps: buildExternalMergeSteps },
  loser_tree: { title:'败者树辅助多路归并', category:'排序 / 外部排序', code:['build loser tree from k current records;','output winner;','read next record from winner run;','adjust along path to root;'], examTips:['败者树用于 k 路归并快速选择最小者。','每输出一个元素调整 O(log k)。','适合外部排序多路归并。'], buildSteps: buildLoserTreeSteps },
  optimal_merge_tree: { title:'最佳归并树', category:'排序 / 外部排序', code:['while more than one run:','    select two shortest runs;','    merge them;','    insert new run length;'], examTips:['最佳归并树思想类似哈夫曼树。','每次合并两个最短归并段。','使归并总代价最小。'], buildSteps: buildOptimalMergeTreeSteps },
  replacement_selection: { title:'置换选择排序', category:'排序 / 外部排序', code:['build min-heap in memory;','output min to current run;','read next record x;','if x >= last_output insert into heap;','else freeze x for next run;'], examTips:['置换选择能生成较长初始归并段。','关键是“冻结”比当前输出小的记录。','常与外部排序归并趟数结合考。'], buildSteps: buildReplacementSelectionSteps },
  sequential_queue: { title:'顺序循环队列实现', category:'线性结构 / 队列', code:DEMO_LIBRARY.queue.code, examTips:['循环队列解决假溢出。','判空 front==rear。','牺牲一个单元判满：(rear+1)%MaxSize==front。'], buildSteps: buildSequentialQueueSteps },
  linked_queue: { title:'链式队列实现', category:'线性结构 / 队列', code:['InitQueue: front = rear = head;','EnQueue: rear->next = s; rear = s;','DeQueue: p = front->next; front->next = p->next;','if (rear == p) rear = front;'], examTips:['链队通常带头结点。','入队改 rear，出队改 front->next。','删除最后一个结点时 rear 要回到 front。'], buildSteps: buildLinkedQueueSteps },
  deque_demo: { title:'双端队列实现与应用', category:'线性结构 / 队列', code:['push_front(x);','push_back(x);','pop_front();','pop_back();'], examTips:['双端队列两端都可插入删除。','常见应用：滑动窗口、回文判断。','注意输入受限/输出受限双端队列。'], buildSteps: buildDequeSteps },
  stack_recursion: { title:'栈在递归中的应用', category:'线性结构 / 栈', code:['int Fact(int n) {','    if (n == 1) return 1;','    return n * Fact(n - 1);','}'], examTips:['递归调用由系统栈保存现场。','递归深度影响空间复杂度。','很多递归算法可改写为显式栈。'], buildSteps: buildStackRecursionSteps },
  bracket_matching: { title:'栈在括号匹配中的应用', category:'线性结构 / 栈', code:['for each ch in string:','    if ch is left bracket: Push(S, ch);','    else if ch is right bracket:','        if StackEmpty(S) return false;','        if Pop(S) does not match ch return false;','return StackEmpty(S);'], examTips:['左括号入栈，右括号与栈顶匹配。','最后栈必须为空。','这是栈应用最常考例题之一。'], buildSteps: buildBracketMatchingSteps },
  doubly_linked_list: { title:'双链表插入与删除', category:'线性结构 / 链表', code:['s->next = p->next;','s->prior = p;','p->next->prior = s;','p->next = s;','p->prior->next = p->next;','p->next->prior = p->prior;'], examTips:['双链表插入删除要改 prior 和 next。','插入要先接后继再改前驱。','删除时要处理首尾边界。'], buildSteps: buildDoublyLinkedSteps },
  circular_linked_list: { title:'循环链表动态演示', category:'线性结构 / 链表', code:['rear->next points to head;','s->next = rear->next;','rear->next = s;','rear = s;'], examTips:['循环链表尾结点指向头结点。','只设尾指针时，找头结点 O(1)：rear->next。','适合循环扫描问题。'], buildSteps: buildCircularLinkedSteps },
  static_linked_list: { title:'静态链表动态演示', category:'线性结构 / 链表', code:['typedef struct { ElemType data; int next; } SLinkList[MAXSIZE];','// cursor next stores array index','// malloc/free are simulated by spare list'], examTips:['静态链表用数组模拟指针。','next 存的是数组下标。','适合不支持指针的语言或考试概念题。'], buildSteps: buildStaticLinkedSteps },
  kmp_next: { ...DEMO_LIBRARY.kmp_next, title:'复杂 KMP next 数组构造', buildSteps: buildKMPNextStepsV2 },
  kmp_match: { ...DEMO_LIBRARY.kmp_match, title:'复杂 KMP 模式匹配', buildSteps: buildKMPMatchStepsV2 },
  kmp_nextval: { title:'KMP next 与 nextval 对照优化', category:'串 / KMP', code:['// 1. 先求最长相等真前后缀长度 lps','lps[i] = longest proper prefix == suffix of P[0..i];','next[0] = -1;','next[j] = lps[j - 1];','if (next[j] == -1 || P[j] != P[next[j]]) nextval[j] = next[j];','else nextval[j] = nextval[next[j]];'], examTips:['next 是由最长相等真前后缀长度推出的。','nextval 是在 next 基础上跳过必然重复失败的比较。','不同教材 next/nextval 下标定义不同，重点掌握推导关系。'], buildSteps: buildKMPNextValSteps }
});

/* ========================= 408 高频总结扩展：内部排序比较表 + 做题技巧 ========================= */

const INTERNAL_SORT_ROWS = [
  ["直接插入排序", "从无序区取一个记录，顺序查找插入到前面有序区", "顺序表、链表", "稳定", "不能确定", "插入类", "O(n)", "O(n²)", "O(n²)", "O(1)"],
  ["折半插入排序", "插入位置用折半查找，元素移动仍需顺序后移", "顺序表", "稳定", "不能确定", "插入类", "比较 O(nlogn)，移动仍可能 O(n²)", "O(n²)", "O(n²)", "O(1)"],
  ["希尔排序", "按增量分组做插入排序，最后 gap=1", "顺序表", "不稳定", "不能确定", "插入类", "与增量有关", "约 O(n^1.3)", "O(n²)", "O(1)"],
  ["冒泡排序", "相邻元素两两比较，逆序则交换", "顺序表、链表", "稳定", "每趟确定一个最大/最小元素最终位置", "交换类", "O(n)", "O(n²)", "O(n²)", "O(1)"],
  ["快速排序", "选 pivot，一趟划分后左小右大，再递归", "顺序表", "不稳定", "每趟确定 pivot 最终位置", "交换类/分治", "O(nlogn)", "O(nlogn)", "O(n²)", "平均 O(logn)，最坏 O(n)"],
  ["简单选择排序", "每趟从无序区选最小，交换到有序区末尾", "顺序表、链表", "不稳定", "每趟确定一个最小元素最终位置", "选择类", "O(n²)", "O(n²)", "O(n²)", "O(1)"],
  ["堆排序", "建大根堆，反复输出堆顶并调整", "顺序表", "不稳定", "每趟确定一个最大元素最终位置", "选择类", "O(nlogn)", "O(nlogn)", "O(nlogn)", "O(1)"],
  ["归并排序", "两两归并，最终形成一个大有序段", "顺序表、链表", "稳定", "不能确定", "归并类/分治", "O(nlogn)", "O(nlogn)", "O(nlogn)", "O(n)"],
  ["基数排序", "按关键字各位分配、收集，一般低位优先", "顺序表、链表/队列", "稳定", "不能确定", "分配类", "O(d(n+r))", "O(d(n+r))", "O(d(n+r))", "O(n+r)"]
];

function buildInternalSortingCompareSteps() {
  const steps = [];
  const headers = ["排序方法", "基本过程", "适用性", "稳定性", "一趟是否定最终位置", "分类", "最好", "平均", "最坏", "空间"];
  const groups = [
    { title: "先整体看：内部排序比较总表", rows: INTERNAL_SORT_ROWS.map((_, i) => i), msg: "这张表对应你发的内部排序比较图，并补充了 408 常问的“稳定性、适用存储、每趟是否确定最终位置”。" },
    { title: "稳定排序：插入、冒泡、归并、基数", rows: [0, 1, 3, 7, 8], msg: "稳定性口诀：直折冒归基稳定，希快选堆不稳定。注意：折半插入只是改了查找插入位置的方式，不改变稳定性。" },
    { title: "不稳定排序：希尔、快速、选择、堆", rows: [2, 4, 5, 6], msg: "不稳定通常来自“远距离交换”或“跨越相同关键字移动”。选择、快排、堆排、希尔都可能破坏相同元素相对次序。" },
    { title: "最好 O(n)：直接插入、冒泡", rows: [0, 3], msg: "当序列基本有序时，直接插入和带 flag 的冒泡最好可达 O(n)，这是选择题高频考点。" },
    { title: "每趟能确定最终位置", rows: [3, 4, 5, 6], msg: "冒泡、快速划分、简单选择、堆排序都能在一趟中确定至少一个元素的最终位置；插入、归并、基数通常不能这样判断。" },
    { title: "空间复杂度容易混淆", rows: [4, 6, 7, 8], msg: "堆排序 O(1)，归并排序 O(n)，快速排序看递归栈：平均 O(logn)，最坏 O(n)，基数排序 O(n+r)。" }
  ];
  groups.forEach((g, idx) => {
    addStep(steps, idx === 0 ? 0 : idx + 1,
      g.msg,
      dsLayout(g.title,
        `<div class="ds-wide-table">${dsTable(headers, INTERNAL_SORT_ROWS, { activeRows: g.rows })}</div>`,
        [
          { title: "速记", html: dsChips(["直折冒归基稳定", "希快选堆不稳定", "堆 O(1)", "归并 O(n)", "快排递归栈"], idx === 1 ? ["直折冒归基稳定"] : idx === 2 ? ["希快选堆不稳定"] : []) },
          { title: "考试提醒", html: `<p class="ds-mini-note">表格题不要只背时间复杂度，还要同时看：稳定性、适用顺序/链式存储、一趟能否确定最终位置、最好情况是否需要特殊标志。</p>` }
        ]),
      g.title);
  });
  return steps;
}

function buildSortingDecisionSteps() {
  const steps = [];
  const rows = [
    ["看到“基本有序”", "优先想到直接插入、冒泡最好 O(n)", "冒泡必须有交换标志 flag 才能最好 O(n)"],
    ["看到“稳定”", "排除希尔、快排、选择、堆", "稳定口诀：直折冒归基"],
    ["看到“空间 O(1)”", "优先：插入、冒泡、选择、希尔、堆", "归并不是 O(1)，基数也不是"],
    ["看到“平均最快且常用”", "快速排序", "最坏 O(n²)，有序序列取端点 pivot 易退化"],
    ["看到“最坏也 O(nlogn)”", "堆排序、归并排序", "快排最坏不是 O(nlogn)"],
    ["看到“链表适用”", "插入、冒泡、选择、归并", "折半插入需要随机访问，一般不适合链表"],
    ["看到“外部排序”", "多路归并、败者树、置换选择、最佳归并树", "核心不是 CPU，而是减少磁盘 I/O"],
    ["看到“按位分配收集”", "基数排序", "稳定性很关键，通常需要队列"],
  ];
  rows.forEach((r, i) => addStep(steps, i % 8,
    `做题线索：${r[0]}，应联想到 ${r[1]}。`,
    dsLayout("内部排序选择题速判法", dsTable(["题干关键词", "优先判断", "避坑"], rows, { activeRows: [i] }), [
      { title: "选择题思路", html: dsChips(["先看稳定性", "再看最好/最坏", "再看空间", "最后看存储结构"], [i < 2 ? "先看稳定性" : i < 5 ? "再看最好/最坏" : i === 5 ? "最后看存储结构" : "再看空间"]) },
      { title: "常见陷阱", html: `<p class="ds-mini-note">“折半插入”只减少比较次数，不消除移动；“快排平均很快”不等于最坏也快；“堆排序”不需要 O(n) 辅助数组。</p>` }
    ]), r[2]));
  return steps;
}

function buildTreeFormulaSkillSteps() {
  const steps = [];
  const rows = [
    ["二叉树性质", "n0 = n2 + 1", "叶子数 = 度为 2 的结点数 + 1"],
    ["第 i 层最多结点", "2^(i-1)", "默认根为第 1 层"],
    ["高度 h 最多结点", "2^h - 1", "满二叉树"],
    ["n 个结点完全二叉树高度", "⌈log2(n+1)⌉ 或 ⌊log2 n⌋+1", "两种写法等价"],
    ["顺序存储孩子", "left=2i, right=2i+1", "这是 1 起始下标；0 起始为 2i+1、2i+2"],
    ["遍历唯一构造", "先+中、后+中、层+中", "没有中序通常不能唯一确定"],
    ["哈夫曼树", "WPL 最小", "每次合并两个最小权值"],
    ["线索二叉树", "空指针改线索", "tag=0 孩子，tag=1 线索"],
  ];
  rows.forEach((r, i) => addStep(steps, i,
    `树的高频公式：${r[0]}，记法为 ${r[1]}。`,
    dsLayout("树与二叉树 408 公式速查", dsTable(["考点", "公式/结论", "注意点"], rows, { activeRows: [i] }), [
      { title: "做题顺序", html: dsChips(["先判断层号从 0 还是 1", "再判断下标从 0 还是 1", "最后代公式"], [i <= 4 ? "先判断层号从 0 还是 1" : "最后代公式"]) },
      { title: "易错点", html: `<p class="ds-mini-note">完全二叉树顺序下标公式最容易因为 0 起始/1 起始写错；构造二叉树时，中序负责“分左右子树”。</p>` }
    ]), r[2]));
  return steps;
}

function buildGraphSkillSteps() {
  const steps = [];
  const rows = [
    ["邻接矩阵", "适合稠密图", "空间 O(n²)，判断两点是否有边 O(1)"],
    ["邻接表", "适合稀疏图", "空间 O(n+e)，找所有邻接点方便"],
    ["DFS", "递归/栈", "可求生成树/生成森林/连通分量"],
    ["BFS", "队列", "无权图单源最短路径"],
    ["拓扑排序", "有向无环图 DAG", "入度为 0 的点入栈/队列"],
    ["关键路径", "AOE 网", "ve、vl、e、l；e==l 是关键活动"],
    ["最小生成树", "无向连通带权图", "Prim 适合稠密图，Kruskal 适合稀疏图"],
    ["最短路径", "Dijkstra / Floyd", "Dijkstra 不适合负权边"],
  ];
  rows.forEach((r, i) => addStep(steps, i,
    `图算法选型：${r[0]} 通常对应 ${r[1]}。`,
    dsLayout("图算法与存储结构速判", dsTable(["考点", "关键词", "核心结论"], rows, { activeRows: [i] }), [
      { title: "复杂度提醒", html: `<p class="ds-mini-note">DFS/BFS 用邻接矩阵通常 O(n²)，用邻接表通常 O(n+e)。题目给的是矩阵还是邻接表，会直接影响时间复杂度。</p>` },
      { title: "关键词", html: dsChips(["稠密图", "稀疏图", "DAG", "AOE", "无权最短路", "负权边"], i === 0 ? ["稠密图"] : i === 1 ? ["稀疏图"] : i === 4 ? ["DAG"] : i === 5 ? ["AOE"] : []) }
    ]), r[2]));
  return steps;
}

function buildASLSkillSteps() {
  const steps = [];
  const rows = [
    ["顺序查找成功 ASL", "各元素查找次数之和 / n", "带哨兵可减少判断次数，但数量级不变"],
    ["顺序查找失败 ASL", "通常看比较到末尾或哨兵", "要看题目是否给概率"],
    ["折半查找成功 ASL", "判定树各结点层数之和 / n", "第几层就是比较几次"],
    ["折半查找失败 ASL", "失败外部结点层数加权", "常画判定树"],
    ["分块查找", "索引表查找 + 块内查找", "ASL = 索引 ASL + 块内 ASL"],
    ["散列表成功 ASL", "成功查找比较次数平均", "按插入后的实际探测次数算"],
    ["散列表失败 ASL", "对每个散列地址失败探测次数平均", "线性探测失败要一直探到空位置"],
    ["装填因子", "α = 记录数 / 表长", "α 越大，冲突越多"],
  ];
  rows.forEach((r, i) => addStep(steps, i,
    `查找 ASL 技巧：${r[0]}，计算核心是 ${r[1]}。`,
    dsLayout("查找 ASL 计算方法", dsTable(["题型", "计算方法", "注意点"], rows, { activeRows: [i] }), [
      { title: "通用口诀", html: dsChips(["先画过程", "数比较次数", "再求平均", "有概率就加权"], ["数比较次数"]) },
      { title: "散列表避坑", html: `<p class="ds-mini-note">失败 ASL 不是看表中已有元素，而是从每个可能散列地址出发，按冲突解决规则探测到第一个空单元为止。</p>` }
    ]), r[2]));
  return steps;
}

function buildCodeTemplateSkillSteps() {
  const steps = [];
  const rows = [
    ["单链表插入", "s->next = p->next; p->next = s;", "先接后继，再接前驱"],
    ["单链表删除", "q = p->next; p->next = q->next; free(q);", "先保存被删结点"],
    ["双链表插入", "s->next=p->next; s->prior=p; p->next->prior=s; p->next=s;", "四根指针，顺序不能乱"],
    ["循环队列判空", "front == rear", "常配合牺牲一个单元"],
    ["循环队列判满", "(rear + 1) % MaxSize == front", "rear 指向下一个可插入位置"],
    ["递归出口", "if (T == NULL) return;", "树遍历模板第一句"],
    ["KMP 失配", "j = next[j] 或 next[j-1]", "取决于教材下标定义"],
    ["并查集 find", "while(parent[x] >= 0) x = parent[x];", "路径压缩常考"],
  ];
  rows.forEach((r, i) => addStep(steps, i,
    `代码模板高频点：${r[0]}，核心代码是 ${r[1]}。`,
    dsLayout("408 代码模板与易错顺序", dsTable(["模板", "关键语句", "记忆方法"], rows, { activeRows: [i] }), [
      { title: "背诵策略", html: dsChips(["链表先保存", "插入先接后继", "队列看 front/rear", "递归先出口"], i <= 2 ? ["插入先接后继"] : i <= 4 ? ["队列看 front/rear"] : ["递归先出口"]) },
      { title: "实战提醒", html: `<p class="ds-mini-note">408 代码题常考“少一行会断链/丢结点/越界”。不要只背意思，要把关键语句顺序背熟。</p>` }
    ]), r[2]));
  return steps;
}

Object.assign(DEMO_LIBRARY, {
  sorting_compare_table: {
    title: "内部排序综合比较表",
    category: "408 高频总结 / 排序",
    code: [
      "// 从四个维度比较排序算法",
      "compare(time_complexity);",
      "compare(space_complexity);",
      "compare(stability);",
      "compare(one_pass_final_position);",
      "compare(storage_structure);"
    ],
    examTips: ["稳定口诀：直折冒归基稳定，希快选堆不稳定。", "一趟确定最终位置：冒泡、快速划分、选择、堆。", "空间：堆 O(1)，归并 O(n)，快排看递归栈。"],
    buildSteps: buildInternalSortingCompareSteps,
  },
  sorting_decision_skills: {
    title: "排序选择题速判技巧",
    category: "408 高频总结 / 排序",
    code: [
      "if (almost_sorted) choose(insert_sort or bubble_with_flag);",
      "if (need_stable) avoid(shell, quick, selection, heap);",
      "if (worst_nlogn) choose(heap_sort or merge_sort);",
      "if (external_sort) consider(k_way_merge, loser_tree);"
    ],
    examTips: ["题干关键词比死背表格更重要。", "折半插入减少比较次数，不改变移动次数。", "快排平均好，不代表最坏好。"],
    buildSteps: buildSortingDecisionSteps,
  },
  tree_formula_skills: {
    title: "树与二叉树公式速记",
    category: "408 高频总结 / 树",
    code: [
      "n0 = n2 + 1;",
      "max_nodes_at_level_i = 2^(i-1);",
      "max_nodes_height_h = 2^h - 1;",
      "height_complete_tree = floor(log2(n)) + 1;"
    ],
    examTips: ["先看层号从 0 还是 1 开始。", "顺序存储下标从 0/1 开始公式不同。", "中序序列负责划分左右子树。"],
    buildSteps: buildTreeFormulaSkillSteps,
  },
  graph_algorithm_skills: {
    title: "图算法选型与复杂度技巧",
    category: "408 高频总结 / 图",
    code: [
      "if (storage == matrix) DFS_BFS_cost = O(n^2);",
      "if (storage == adj_list) DFS_BFS_cost = O(n + e);",
      "if (DAG) use(topological_sort);",
      "if (AOE) compute(ve, vl, e, l);"
    ],
    examTips: ["邻接矩阵适合稠密图，邻接表适合稀疏图。", "BFS 可求无权图最短路。", "关键路径看 e==l。"],
    buildSteps: buildGraphSkillSteps,
  },
  asl_hash_skills: {
    title: "查找 ASL 与散列表计算技巧",
    category: "408 高频总结 / 查找",
    code: [
      "ASL_success = sum(success_compare_times) / n;",
      "ASL_fail = sum(fail_compare_times) / m;",
      "alpha = records / table_size;",
      "// draw the exact search path first"
    ],
    examTips: ["ASL 本质就是平均比较次数。", "折半查找 ASL 可以画判定树。", "散列表失败 ASL 要从每个地址探到空单元。"],
    buildSteps: buildASLSkillSteps,
  },
  code_template_skills: {
    title: "常考代码模板与易错顺序",
    category: "408 高频总结 / 代码",
    code: [
      "// 链表：先保存，再改指针",
      "// 队列：看 front/rear 含义",
      "// 递归：先写出口，再写递归体",
      "// KMP：先统一 next 下标定义"
    ],
    examTips: ["链表题最怕断链和丢结点。", "循环队列必须先明确是否牺牲一个单元。", "KMP 不同教材下标定义不同，但跳转思想一致。"],
    buildSteps: buildCodeTemplateSkillSteps,
  }
});

/* ========================= 408 计算机组成原理扩展：硬件部件、模型机、存储/Cache/运算/I-O ========================= */

function coUnit(label, desc, activeSet) {
  const cls = ["co-unit"];
  if (activeSet.has(label)) cls.push("active");
  return `<div class="${cls.join(" ")}"><div class="co-unit-name">${escapeHtml(label)}</div><div class="co-unit-desc">${escapeHtml(desc)}</div></div>`;
}

function coUnitGrid(active = []) {
  const a = dsSet(active);
  const units = [
    ["主存", "存放指令和数据"], ["MAR", "地址寄存器"], ["MDR", "数据寄存器"],
    ["ACC", "累加器"], ["MQ", "乘商寄存器"], ["X", "通用/操作数寄存器"], ["ALU", "算术逻辑单元"],
    ["PC", "下一条指令地址"], ["IR", "当前指令"], ["CU", "译码并发控制信号"]
  ];
  return `<div class="co-unit-grid">${units.map(u => coUnit(u[0], u[1], a)).join("")}</div>`;
}

function coMachineHtml(active = [], busText = "") {
  const a = dsSet(active);
  const chip = name => `<span class="co-chip ${a.has(name) ? "active" : ""}">${escapeHtml(name)}</span>`;
  return `<div class="co-machine">
    <div class="co-flow-row">${chip("PC")}<span class="co-arrow">→</span>${chip("MAR")}<span class="co-arrow">→</span>${chip("主存")}<span class="co-arrow">→</span>${chip("MDR")}<span class="co-arrow">→</span>${chip("IR")}</div>
    <div class="co-flow-row">${chip("CU")}<span class="co-arrow">发控制信号</span>${chip("ACC")}<span class="co-arrow">↔</span>${chip("ALU")}<span class="co-arrow">↔</span>${chip("X")}<span class="co-arrow">/</span>${chip("MQ")}</div>
    <div class="co-bus">${escapeHtml(busText || "数据通路：地址、数据、控制信号在部件之间流动")}</div>
  </div>`;
}

function coState(title, active, regValues, memoryRows, activeRegNames = [], activeMemRows = [], note = "") {
  const regRows = [
    ["PC", regValues.PC || "—", "程序计数器：存下一条指令地址"],
    ["MAR", regValues.MAR || "—", "地址寄存器：指出访问哪个存储单元"],
    ["MDR", regValues.MDR || "—", "数据寄存器：暂存读/写数据"],
    ["IR", regValues.IR || "—", "指令寄存器：保存当前指令"],
    ["ACC", regValues.ACC || "—", "累加器：保存操作数或运算结果"],
    ["CU", regValues.CU || "—", "控制器：译码并产生控制信号"]
  ];
  const regActiveRows = regRows.map((r, i) => activeRegNames.includes(r[0]) ? i : -1).filter(i => i >= 0);
  return dsLayout(title,
    coMachineHtml(active, note),
    [
      { title: "寄存器状态", html: dsTable(["寄存器", "当前值", "作用"], regRows, { activeRows: regActiveRows }) },
      { title: "主存示例", html: dsTable(["地址", "内容", "说明"], memoryRows, { activeRows: activeMemRows }) }
    ],
    note
  );
}

function buildCOHardwareOverviewSteps() {
  const steps = [];
  const rows = [
    ["主存", "存放指令和数据", "存储元、存储单元、存储字、存储字长、地址"],
    ["MAR", "保存要访问的主存地址", "位数反映可寻址存储单元数：2^MAR位"],
    ["MDR", "保存要写入或刚读出的数据", "位数通常等于存储字长"],
    ["ACC", "累加器，保存操作数或运算结果", "加减运算常以 ACC 为核心"],
    ["MQ", "乘商寄存器", "乘法/除法中保存乘数、商等"],
    ["X", "通用寄存器或操作数寄存器", "暂存操作数"],
    ["ALU", "算术逻辑单元", "完成加减、逻辑运算、移位等"],
    ["PC", "程序计数器", "保存下一条指令地址，取指后通常 PC+1"],
    ["IR", "指令寄存器", "保存当前正在执行的指令"],
    ["CU", "控制单元", "分析指令，发出微操作控制信号"]
  ];
  const groups = [
    { active:["主存"], rows:[0], desc:"主存是存放指令和数据的地方。408 常考存储元、存储单元、存储字、存储字长、地址之间的关系。" },
    { active:["MAR"], rows:[1], desc:"MAR 保存地址。若 MAR 为 m 位，最多可寻址 2^m 个存储单元。" },
    { active:["MDR"], rows:[2], desc:"MDR 暂存读/写数据。MDR 位数通常等于存储字长。" },
    { active:["ACC","MQ","X","ALU"], rows:[3,4,5,6], desc:"运算器由 ACC、MQ、X、ALU 等组成。ALU 真正执行算术/逻辑运算，寄存器负责暂存数据。" },
    { active:["PC","IR","CU"], rows:[7,8,9], desc:"控制器相关部件：PC 给出下一条指令地址，IR 保存当前指令，CU 译码并发控制信号。" },
    { active:["PC","MAR","主存","MDR","IR","CU","ACC","ALU"], rows:[0,1,2,3,6,7,8,9], desc:"工作过程口诀：取指令到 IR，PC 自动加 1，CU 分析指令，再指挥其他部件完成执行。" }
  ];
  groups.forEach((g, i) => addStep(steps, Math.min(i, 8), g.desc,
    dsLayout("计算机硬件部件总览", coUnitGrid(g.active), [
      { title:"部件作用表", html:dsTable(["部件", "作用", "408 高频考法"], rows, { activeRows:g.rows }) },
      { title:"记忆提示", html:dsChips(["MAR 存地址", "MDR 存数据", "PC 下一条", "IR 当前条", "CU 发信号", "ALU 做运算"], g.active.map(x => x === "主存" ? "MAR 存地址" : x === "MDR" ? "MDR 存数据" : x === "PC" ? "PC 下一条" : x === "IR" ? "IR 当前条" : x === "CU" ? "CU 发信号" : x === "ALU" ? "ALU 做运算" : x).filter(x => ["MAR 存地址","MDR 存数据","PC 下一条","IR 当前条","CU 发信号","ALU 做运算"].includes(x))) }
    ]),
    g.desc));
  return steps;
}

function buildCOModelMachineSteps() {
  const steps = [];
  const mem = [["100", "ADD 200", "当前要取的指令"], ["101", "STA 201", "下一条指令"], ["200", "0005", "操作数 5"], ["201", "—", "结果存放单元"]];
  addStep(steps, 0, "模型机初始状态：PC 指向 100，ACC 中已有 7，主存 100 单元存放 ADD 200。", coState("模型机：ADD 200 指令执行全过程", ["PC","ACC","主存"], {PC:"100", ACC:"7"}, mem, ["PC","ACC"], [0,2], "例：执行 ADD 200，即 ACC = ACC + M[200]。"), "初始：PC=100，ACC=7");
  addStep(steps, 1, "取指第 1 步：PC 的内容送入 MAR，指出要访问主存 100 单元。", coState("取指周期 ①：PC → MAR", ["PC","MAR"], {PC:"100", MAR:"100", ACC:"7"}, mem, ["PC","MAR"], [0], "控制信号：PCout、MARin。"), "MAR ← PC = 100");
  addStep(steps, 2, "取指第 2 步：按 MAR 给出的地址读主存，指令 ADD 200 进入 MDR，同时 PC 自动加 1。", coState("取指周期 ②：M[MAR] → MDR，PC+1", ["MAR","主存","MDR","PC"], {PC:"101", MAR:"100", MDR:"ADD 200", ACC:"7"}, mem, ["PC","MAR","MDR"], [0], "控制信号：MemRead、MDRin、PC+1。"), "MDR ← M[100]；PC ← 101");
  addStep(steps, 3, "取指第 3 步：MDR 中的指令送入 IR，当前指令固定下来。", coState("取指周期 ③：MDR → IR", ["MDR","IR"], {PC:"101", MAR:"100", MDR:"ADD 200", IR:"ADD 200", ACC:"7"}, mem, ["MDR","IR"], [0], "IR 保存当前指令，PC 已指向下一条。"), "IR ← ADD 200");
  addStep(steps, 4, "译码：CU 分析 IR，知道操作码是 ADD，地址码是 200。", coState("译码：CU 分析 IR", ["IR","CU"], {PC:"101", IR:"ADD 200", ACC:"7", CU:"ADD，addr=200"}, mem, ["IR","CU"], [2], "CU 不直接做加法，而是发出控制信号让数据通路工作。"), "操作码 ADD，形式地址 200");
  addStep(steps, 5, "执行第 1 步：把地址码 200 送入 MAR，准备读取操作数。", coState("执行周期 ①：IR 地址码 → MAR", ["IR","MAR"], {PC:"101", MAR:"200", IR:"ADD 200", ACC:"7", CU:"ADD"}, mem, ["MAR","IR"], [2], "访存取操作数：MAR ← IR(addr)。"), "MAR ← 200");
  addStep(steps, 6, "执行第 2 步：读主存 200 单元，把操作数 5 送入 MDR。", coState("执行周期 ②：M[200] → MDR", ["MAR","主存","MDR"], {PC:"101", MAR:"200", MDR:"5", IR:"ADD 200", ACC:"7"}, mem, ["MAR","MDR"], [2], "MDR 暂存从主存读出的操作数。"), "MDR ← M[200] = 5");
  addStep(steps, 7, "执行第 3 步：ACC 与 MDR 送入 ALU 相加，结果写回 ACC。", coState("执行周期 ③：ACC + MDR → ACC", ["ACC","MDR","ALU"], {PC:"101", MAR:"200", MDR:"5", IR:"ADD 200", ACC:"12"}, mem, ["ACC","MDR"], [2], "ALU 完成加法，ACC 保存结果。"), "ACC ← 7 + 5 = 12");
  addStep(steps, 8, "指令执行完成：PC 已经指向下一条指令 101，ACC 中保存本条指令结果 12。", coState("完成：准备下一条指令", ["PC","ACC","IR"], {PC:"101", MAR:"200", MDR:"5", IR:"ADD 200", ACC:"12"}, mem, ["PC","ACC","IR"], [1], "下一次取指将从 PC=101 开始。"), "本条指令完成，转入下一取指周期");
  return steps;
}

function buildCOInstructionCycleSteps() {
  const steps = [];
  const rows = [
    ["取指周期", "PC → MAR；M[MAR] → MDR → IR；PC+1", "所有指令都必须经历"],
    ["间址周期", "若地址码给的是操作数地址的地址，则再次访存取有效地址", "只有间接寻址才有"],
    ["执行周期", "按操作码完成运算、访存、转移等", "不同指令差异最大"],
    ["中断周期", "保存断点，转入中断服务程序", "有中断请求且允许中断时发生"]
  ];
  const flows = ["取指", "间址", "执行", "中断"];
  rows.forEach((r, i) => addStep(steps, i, `${r[0]}：${r[1]}。`,
    dsLayout("指令周期组成", `<div class="co-timeline">${flows.map((f, j) => `<div class="co-time-node ${j === i ? "active" : j < i ? "visited" : ""}">${escapeHtml(f)}</div>`).join("<span class='co-arrow'>→</span>")}</div>`, [
      { title:"周期对比", html:dsTable(["阶段", "主要微操作", "是否必有"], rows, { activeRows:[i] }) },
      { title:"408 速记", html:dsChips(["取指必有", "间址可选", "执行必有", "中断可选", "PC 保存下一条"], i === 0 ? ["取指必有", "PC 保存下一条"] : i === 1 ? ["间址可选"] : i === 2 ? ["执行必有"] : ["中断可选"]) }
    ]), r[2]));
  return steps;
}

function buildCODatapathControlSteps() {
  const steps = [];
  const rows = [
    ["数据通路", "寄存器、ALU、总线、多路选择器之间形成的数据流动路径", "看数据从哪来到哪去"],
    ["控制信号", "控制寄存器装入、ALU 操作、存储器读写、总线选择", "看谁允许输出/谁允许写入"],
    ["硬布线控制", "组合逻辑直接产生控制信号", "速度快，设计修改困难"],
    ["微程序控制", "微指令控制微操作序列", "规整易修改，速度相对慢"],
    ["微操作", "一个时钟节拍内完成的基本操作", "如 PC→MAR、MDR→IR"]
  ];
  const active = [["PC","MAR"], ["CU","IR","MAR","MDR"], ["CU"], ["CU"], ["PC","MAR"]];
  rows.forEach((r, i) => addStep(steps, i, `${r[0]}：${r[1]}。`,
    dsLayout("数据通路与控制器", coMachineHtml(active[i], i === 0 ? "示例微操作：PCout + MARin，让 PC 的内容进入 MAR。" : i === 1 ? "控制信号决定谁上总线、谁接收、ALU 做什么。" : "控制器负责把指令翻译成微操作序列。"), [
      { title:"概念对比", html:dsTable(["概念", "含义", "做题抓手"], rows, { activeRows:[i] }) },
      { title:"微操作例子", html:dsChips(["PC→MAR", "M[MAR]→MDR", "MDR→IR", "ACC+MDR→ACC", "PC+1"], i === 0 || i === 4 ? ["PC→MAR"] : i === 1 ? ["M[MAR]→MDR", "MDR→IR"] : []) }
    ]), r[2]));
  return steps;
}

function buildCOMemoryAddressSteps() {
  const steps = [];
  const rows = [
    ["存储元", "存 1 位二进制 0/1", "最小物理记忆单元"],
    ["存储单元", "一次按地址访问的单位", "每个单元有唯一地址"],
    ["存储字", "一个存储单元中存放的一串二进制代码", "长度叫存储字长"],
    ["MAR 位数", "决定可寻址单元个数", "m 位 MAR → 2^m 个地址"],
    ["MDR 位数", "决定一次读/写数据位数", "通常等于存储字长"],
    ["容量计算", "单元数 × 存储字长", "注意 bit、B、KB 转换"]
  ];
  const exampleRows = [
    ["MAR", "12 位", "可寻址 2^12 = 4096 个存储单元"],
    ["MDR", "16 位", "存储字长 = 16 bit = 2 B"],
    ["总容量", "4096 × 16 bit", "65536 bit = 8192 B = 8 KB"]
  ];
  rows.forEach((r, i) => addStep(steps, i, `${r[0]}：${r[1]}。`,
    dsLayout("主存基本概念与容量计算", `<div class="co-memory-formula"><strong>例题：</strong>MAR=12 位，MDR=16 位，则主存容量 = 2<sup>12</sup> × 16 bit = 8 KB。</div>${coUnitGrid(i < 3 ? ["主存"] : i === 3 ? ["MAR"] : i === 4 ? ["MDR"] : ["MAR","MDR","主存"])}`, [
      { title:"概念表", html:dsTable(["概念", "含义", "考点"], rows, { activeRows:[i] }) },
      { title:"容量计算示例", html:dsTable(["项目", "数值", "结论"], exampleRows, { activeRows: i === 3 ? [0] : i === 4 ? [1] : i === 5 ? [2] : [] }) }
    ]), r[2]));
  return steps;
}

function buildCOCacheMappingSteps() {
  const steps = [];
  const addrBits = "0010101010110100".split("");
  const groups = [
    { name:"块内偏移 offset", range:[12,13,14,15], desc:"块大小 16B，所以块内地址需要 log2(16)=4 位。" },
    { name:"Cache 行号 index", range:[9,10,11], desc:"Cache 共 8 行，直接映射需要 log2(8)=3 位行号。" },
    { name:"标记 tag", range:[0,1,2,3,4,5,6,7,8], desc:"剩余高位作为 tag，用来判断这一行中存的是哪个主存块。" }
  ];
  const rows = [["主存地址", "0x2AB4", "二进制 0010 1010 1011 0100"], ["块大小", "16B", "offset=4 位"], ["Cache 行数", "8 行", "index=3 位"], ["Tag", "001010101", "高 9 位"], ["Index", "011", "映射到第 3 行"], ["Offset", "0100", "块内第 4 字节"]];
  groups.forEach((g, i) => addStep(steps, i, g.desc,
    dsLayout("Cache 直接映射地址划分", `<div class="co-bit-row">${addrBits.map((b, idx) => `<span class="co-bit ${g.range.includes(idx) ? "active" : idx < 9 && i > 0 ? "visited" : ""}">${b}</span>`).join("")}</div><p class="ds-mini-note">地址格式：Tag(9) | Index(3) | Offset(4)</p>`, [
      { title:"地址划分表", html:dsTable(["项目", "数值", "说明"], rows, { activeRows: i === 0 ? [1,5] : i === 1 ? [2,4] : [3] }) },
      { title:"映射方法对比", html:dsTable(["映射方式", "位置限制", "优缺点"], [["直接映射", "每个主存块只能进固定 Cache 行", "硬件简单，但冲突多"], ["全相联", "可进任意行", "冲突少，但比较器多"], ["组相联", "先定组，组内任意", "折中，408 常考"]], { activeRows:[0] }) }
    ]), g.name));
  addStep(steps, 3, "如果 Cache 第 3 行 tag 也为 001010101，则命中；否则不命中，需要把对应主存块调入该行。", dsLayout("Cache 命中判断", `<div class="co-cache-line"><span>第 3 行</span><span class="co-bit active">tag=001010101</span><span class="co-bit active">data block</span></div>`, [
    { title:"命中条件", html:dsTable(["条件", "是否满足", "含义"], [["index 找到第 3 行", "是", "由地址中 index 决定"], ["valid=1", "假设是", "该行内容有效"], ["tag 相等", "是", "说明该行就是目标主存块"]], { activeRows:[2] }) },
    { title:"常考公式", html:dsChips(["Cache 容量", "块大小", "行数", "tag/index/offset", "命中率"], ["tag/index/offset"]) }
  ]), "命中：Cache 第 3 行 tag 相同");
  return steps;
}

function buildCOComplementOverflowSteps() {
  const steps = [];
  const rows = [
    ["正数补码", "符号位 0，数值位为原码", "+72 = 01001000"],
    ["负数补码", "原码取反加 1", "-58：10111010"],
    ["加法", "补码直接相加，丢弃最高进位", "减法转加负数"],
    ["溢出判定 1", "同号相加，结果异号", "正+正得负 或 负+负得正"],
    ["溢出判定 2", "最高位进位与次高位进位异或", "C最高 ⊕ C次高 = 1 溢出"]
  ];
  const examples = [["72", "01001000"], ["58", "00111010"], ["相加结果", "10000010"], ["数学结果", "130", "超出 8 位补码最大正数 127"]];
  rows.forEach((r, i) => addStep(steps, i, `${r[0]}：${r[1]}。`,
    dsLayout("补码加减与溢出判断", `<div class="co-binary-stack"><div>  01001000  (+72)</div><div>+ 00111010  (+58)</div><div class="co-binary-result ${i >= 3 ? "danger" : ""}">= 10000010</div></div>`, [
      { title:"规则表", html:dsTable(["考点", "规则", "例子"], rows, { activeRows:[i] }) },
      { title:"本例分析", html:dsTable(["项目", "值", "说明"], examples, { activeRows: i >= 3 ? [2,3] : [] }) }
    ]), i >= 3 ? "正数 + 正数却得到符号位 1，发生溢出。" : "补码运算可直接用加法器。"));
  return steps;
}

function buildCOFloatingPointSteps() {
  const steps = [];
  const rows = [
    ["十进制数", "13.25", "先转二进制"],
    ["二进制", "1101.01", "13=1101，0.25=0.01"],
    ["规格化", "1.10101 × 2^3", "小数点左边保留 1 位非零数"],
    ["符号位 S", "0", "正数为 0，负数为 1"],
    ["阶码 E", "3 + 127 = 130", "IEEE 单精度偏置常数 127"],
    ["尾数 M", "1010100...", "隐藏最高位 1，只存小数部分"]
  ];
  rows.forEach((r, i) => addStep(steps, i, `${r[0]}：${r[1]}。`,
    dsLayout("浮点数规格化与 IEEE 754 思路", `<div class="co-float"><span class="${i===3?'active':''}">S=0</span><span class="${i===4?'active':''}">E=10000010</span><span class="${i===5?'active':''}">M=101010000...</span></div><p class="ds-mini-note">例：13.25 = 1101.01₂ = 1.10101₂ × 2³。</p>`, [
      { title:"转换过程", html:dsTable(["步骤", "结果", "注意点"], rows, { activeRows:[i] }) },
      { title:"常考提醒", html:dsChips(["规格化", "阶码偏置", "隐藏位", "舍入", "溢出/下溢"], i === 2 ? ["规格化"] : i === 4 ? ["阶码偏置"] : i === 5 ? ["隐藏位"] : []) }
    ]), r[2]));
  return steps;
}

function buildCOIOInterruptDMASteps() {
  const steps = [];
  const rows = [
    ["程序查询", "CPU 反复查询设备状态", "简单但浪费 CPU"],
    ["中断方式", "设备完成后请求中断，CPU 响应并执行服务程序", "提高 CPU 利用率"],
    ["DMA", "外设和主存直接成批交换数据", "适合高速块设备"],
    ["中断隐指令", "关中断、保存断点、引出中断服务程序", "由硬件自动完成"],
    ["中断返回", "恢复现场，回到原程序", "断点通常保存在栈或特定寄存器中"]
  ];
  const activeSets = [["CPU","外设"], ["外设","CPU","CU"], ["DMA","主存","外设"], ["CPU","PC","IR"], ["CPU","PC"]];
  rows.forEach((r, i) => addStep(steps, i, `${r[0]}：${r[1]}。`,
    dsLayout("I/O 控制：查询、中断、DMA", `<div class="co-unit-grid compact">${["CPU","CU","主存","外设","DMA","PC","IR"].map(x => coUnit(x, x === "DMA" ? "直接存储器访问" : x === "外设" ? "键盘/磁盘/网卡等" : "", dsSet(activeSets[i]))).join("")}</div>`, [
      { title:"I/O 方式对比", html:dsTable(["方式", "过程", "特点"], rows, { activeRows:[i] }) },
      { title:"考点速记", html:dsChips(["查询浪费 CPU", "中断保存断点", "DMA 不经 CPU 搬数据", "块传送", "中断返回恢复现场"], i === 0 ? ["查询浪费 CPU"] : i === 1 || i === 3 ? ["中断保存断点"] : i === 2 ? ["DMA 不经 CPU 搬数据", "块传送"] : ["中断返回恢复现场"]) }
    ]), r[2]));
  return steps;
}

function buildCOPerformanceSteps() {
  const steps = [];
  const rows = [
    ["CPU 执行时间", "T = 指令条数 IC × CPI × 时钟周期", "也可写为 IC × CPI / 主频"],
    ["CPI", "平均每条指令需要的时钟周期数", "不同指令可加权平均"],
    ["MIPS", "指令条数 / (执行时间 × 10^6)", "只适合同一指令系统粗略比较"],
    ["Amdahl 定律", "整体加速受可优化部分比例限制", "只优化小部分，整体提升有限"],
    ["流水线吞吐", "理想情况下接近每周期完成一条指令", "会受结构/数据/控制相关影响"]
  ];
  rows.forEach((r, i) => addStep(steps, i, `${r[0]}：${r[1]}。`,
    dsLayout("性能指标与流水线技巧", `<div class="co-formula">CPU Time = IC × CPI × Clock Cycle = IC × CPI / f</div><div class="co-timeline">${["IF","ID","EX","MEM","WB"].map((x,j)=>`<div class="co-time-node ${j<=i && i===4?'active':''}">${x}</div>`).join("<span class='co-arrow'>→</span>")}</div>`, [
      { title:"公式表", html:dsTable(["指标", "公式/含义", "易错点"], rows, { activeRows:[i] }) },
      { title:"408 提醒", html:dsChips(["IC", "CPI", "主频", "时钟周期", "流水线冲突"], i === 0 ? ["IC","CPI","时钟周期"] : i === 4 ? ["流水线冲突"] : []) }
    ]), r[2]));
  return steps;
}

function buildCOExamSkillSteps() {
  const steps = [];
  const rows = [
    ["看到 MAR", "想到可寻址单元数 2^m", "不是存储字长"],
    ["看到 MDR", "想到一次读/写的数据位数", "通常等于存储字长"],
    ["看到 PC", "取指后 PC 自动加 1 或转移修改", "PC 指向下一条指令"],
    ["看到 IR", "保存当前指令", "CU 根据 IR 译码"],
    ["看到 Cache 地址", "先拆 offset，再拆 index，剩余 tag", "块大小决定 offset"],
    ["看到补码溢出", "同号相加结果异号", "不要只看最高进位"],
    ["看到浮点数", "先转二进制，再规格化，再偏置阶码", "尾数隐藏最高位 1"],
    ["看到中断", "保存断点、关中断、转服务程序", "中断隐指令由硬件完成"],
    ["看到 DMA", "外设与主存直接交换数据", "CPU 只参与初始化和结束处理"]
  ];
  rows.forEach((r, i) => addStep(steps, i, `组成原理速判：${r[0]}，应联想到 ${r[1]}。`,
    dsLayout("408 组成原理高频速判技巧", `<div class="ds-wide-table">${dsTable(["题干关键词", "立刻联想", "避坑"], rows, { activeRows:[i] })}</div>`, [
      { title:"复习顺序", html:dsChips(["部件作用", "指令周期", "存储系统", "运算方法", "I/O", "性能公式"], i < 4 ? ["部件作用", "指令周期"] : i === 4 ? ["存储系统"] : i < 7 ? ["运算方法"] : ["I/O"]) },
      { title:"做题方法", html:`<p class="ds-mini-note">组成原理题不要只背名词，要画“数据从哪来 → 经过哪个寄存器/总线 → 写到哪里”。模型机题尤其要按微操作顺序写。</p>` }
    ]), r[2]));
  return steps;
}

Object.assign(DEMO_LIBRARY, {
  co_hardware_overview: {
    title: "计算机硬件部件总览",
    category: "计算机组成原理 / 硬件部件",
    code: [
      "// 主存：存放指令和数据",
      "MAR <- address;      // 地址寄存器",
      "MDR <- data;         // 数据寄存器",
      "ACC/MQ/X -> ALU;     // 运算器",
      "PC -> MAR; MDR -> IR; CU decode(IR);"
    ],
    examTips: ["MAR 位数决定可寻址单元数量。", "MDR 位数通常等于存储字长。", "PC 存下一条指令地址，IR 存当前指令，CU 负责发控制信号。"],
    buildSteps: buildCOHardwareOverviewSteps,
  },
  co_model_machine: {
    title: "模型机：取指与 ADD 指令执行",
    category: "计算机组成原理 / 模型机",
    code: [
      "// 指令：ADD 200，含义 ACC = ACC + M[200]",
      "MAR <- PC;",
      "MDR <- M[MAR]; PC <- PC + 1;",
      "IR <- MDR;",
      "CU decodes IR;",
      "MAR <- IR.address;",
      "MDR <- M[MAR];",
      "ACC <- ACC + MDR;"
    ],
    examTips: ["取指周期所有指令都有。", "PC 在取指过程中通常自动加 1。", "执行期按操作码不同而不同，ADD 通常要再访存取操作数。"],
    buildSteps: buildCOModelMachineSteps,
  },
  co_instruction_cycle: {
    title: "指令周期：取指/间址/执行/中断",
    category: "计算机组成原理 / 指令系统",
    code: [
      "InstructionCycle() {",
      "    Fetch();",
      "    if (indirect_addressing) Indirect();",
      "    Execute();",
      "    if (interrupt_request && interrupt_enable) Interrupt();",
      "}"
    ],
    examTips: ["取指和执行通常必有，间址和中断不一定有。", "间址周期用于取有效地址。", "中断周期要保存断点并转入服务程序。"],
    buildSteps: buildCOInstructionCycleSteps,
  },
  co_datapath_control: {
    title: "数据通路与控制信号",
    category: "计算机组成原理 / CPU",
    code: [
      "// 微操作例子",
      "PCout, MARin;        // PC -> MAR",
      "MemRead, MDRin;      // M[MAR] -> MDR",
      "MDRout, IRin;        // MDR -> IR",
      "ALUop=ADD, ACCin;    // ACC + MDR -> ACC"
    ],
    examTips: ["数据通路看数据流动方向。", "控制信号看谁输出、谁装入、ALU 做什么。", "硬布线快，微程序规整易修改。"],
    buildSteps: buildCODatapathControlSteps,
  },
  co_memory_addressing: {
    title: "主存容量与 MAR/MDR 计算",
    category: "计算机组成原理 / 存储器",
    code: [
      "addressable_units = 2 ^ MAR_bits;",
      "word_length = MDR_bits;",
      "capacity_bits = addressable_units * word_length;",
      "capacity_bytes = capacity_bits / 8;"
    ],
    examTips: ["MAR 位数决定地址个数。", "MDR 位数通常等于存储字长。", "容量单位 bit、B、KB 要换算清楚。"],
    buildSteps: buildCOMemoryAddressSteps,
  },
  co_cache_mapping: {
    title: "Cache 地址映射：Tag/Index/Offset",
    category: "计算机组成原理 / Cache",
    code: [
      "offset_bits = log2(block_size);",
      "index_bits = log2(cache_lines);",
      "tag_bits = address_bits - index_bits - offset_bits;",
      "hit = valid[index] && tag[index] == address_tag;"
    ],
    examTips: ["先由块大小确定 offset。", "直接映射由 Cache 行数确定 index。", "剩余高位是 tag，用于命中判断。"],
    buildSteps: buildCOCacheMappingSteps,
  },
  co_complement_overflow: {
    title: "补码加减与溢出判断",
    category: "计算机组成原理 / 运算方法",
    code: [
      "// 补码加法：直接相加，丢弃最高进位",
      "sum = x + y;",
      "overflow = (x.sign == y.sign) && (sum.sign != x.sign);",
      "// 减法：x - y = x + (-y)"
    ],
    examTips: ["补码减法转化为加负数。", "同号相加结果异号就是溢出。", "最高位进位不等于溢出，要看规则。"],
    buildSteps: buildCOComplementOverflowSteps,
  },
  co_floating_point: {
    title: "浮点数规格化与 IEEE 754 思路",
    category: "计算机组成原理 / 运算方法",
    code: [
      "binary = convert_to_binary(x);",
      "normalize: x = 1.M * 2^E;",
      "sign = x < 0 ? 1 : 0;",
      "biased_exponent = E + bias;",
      "fraction = M without hidden leading 1;"
    ],
    examTips: ["先转二进制，再规格化。", "IEEE 单精度阶码偏置常数为 127。", "规格化数最高位 1 通常隐藏不存。"],
    buildSteps: buildCOFloatingPointSteps,
  },
  co_io_interrupt_dma: {
    title: "I/O：程序查询、中断、DMA",
    category: "计算机组成原理 / I/O",
    code: [
      "// 程序查询：CPU polling device status",
      "// 中断：device -> interrupt request -> ISR",
      "// DMA：device <-> memory directly",
      "CPU initializes DMA; DMA transfers block; DMA interrupts CPU when done;"
    ],
    examTips: ["程序查询简单但浪费 CPU。", "中断要保存断点并执行中断服务程序。", "DMA 适合高速块传送，数据主要在外设和主存间搬运。"],
    buildSteps: buildCOIOInterruptDMASteps,
  },
  co_performance_pipeline: {
    title: "CPU 性能公式与流水线基础",
    category: "计算机组成原理 / 性能与流水线",
    code: [
      "CPU_time = IC * CPI * clock_cycle;",
      "CPU_time = IC * CPI / clock_rate;",
      "speedup = old_time / new_time;",
      "pipeline_time ≈ (k + n - 1) * clock_cycle;"
    ],
    examTips: ["CPU 时间三要素：IC、CPI、时钟周期。", "主频越高不一定整体越快，还要看 CPI。", "流水线会受结构相关、数据相关、控制相关影响。"],
    buildSteps: buildCOPerformanceSteps,
  },
  co_exam_skills: {
    title: "组成原理 408 高频速判技巧",
    category: "计算机组成原理 / 高频技巧",
    code: [
      "if (keyword == MAR) think(address_count);",
      "if (keyword == MDR) think(word_length);",
      "if (keyword == Cache) split(tag, index, offset);",
      "if (keyword == interrupt) save_breakpoint;",
      "if (keyword == DMA) memory_device_direct_transfer;"
    ],
    examTips: ["模型机题按微操作顺序写。", "存储题先判断按字节编址还是按字编址。", "Cache 题先拆地址，运算题先统一二进制表示。"],
    buildSteps: buildCOExamSkillSteps,
  }
});


/* ========================= 408 组成原理二次增强：存储系统、磁盘、寻址与过程调用 ========================= */
function coMemoryArrayHtml(activeRow = -1, activeCol = -1, mode = "idle") {
  const cells = [];
  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 8; c++) {
      const cls = ["co-mem-cell"];
      if (r === activeRow) cls.push("row-active");
      if (r === activeRow && c === activeCol) cls.push(mode === "write" ? "write" : "read");
      cells.push(`<span class="${cls.join(" ")}">${r}${c}</span>`);
    }
  }
  return `<div class="co-memory-anatomy"><div class="co-row-decoder">地址译码器<br><small>选择一条字线</small></div><div><div class="co-wordline-label">字线（行选择）</div><div class="co-mem-grid">${cells.join("")}</div><div class="co-bitline-label">位线 → 读出放大器 / 写入电路</div></div></div>`;
}

function coChipBankHtml(activeBank = -1) {
  const banks = [];
  for (let bank = 0; bank < 4; bank++) {
    banks.push(`<div class="co-chip-bank ${bank === activeBank ? "active" : ""}"><div class="co-bank-label">片选组 ${bank}</div><div class="co-chip-pair"><span>1K×4<br>D3~D0</span><span>1K×4<br>D7~D4</span></div></div>`);
  }
  return `<div class="co-chip-design"><div class="co-decoder-box">A11 A10<br>2-4 译码器</div><div class="co-bank-stack">${banks.join("")}</div></div><div class="co-common-lines">A9~A0 接到全部芯片；每组选中的两片并行输出 8 位。</div>`;
}

function coCpuMemoryBusHtml(active = []) {
  const a = dsSet(active);
  const bus = (name, direction, key, text) => `<div class="co-bus-lane ${a.has(key) ? "active" : ""}"><span>${escapeHtml(name)}</span><b>${direction}</b><small>${escapeHtml(text)}</small></div>`;
  return `<div class="co-cpu-memory"><div class="co-endpoint ${a.has("CPU") ? "active" : ""}"><strong>CPU</strong><span>MAR / MDR / 控制器</span></div><div class="co-bus-stack">${bus("地址总线", "→", "ADDR", "CPU 指定访问单元，通常单向")}${bus("数据总线", "↔", "DATA", "读写数据，双向")}${bus("控制总线", "↔", "CTRL", "读、写、片选、就绪")}</div><div class="co-endpoint ${a.has("MEM") ? "active" : ""}"><strong>主存</strong><span>译码器 / 存储阵列 / 读写电路</span></div></div>`;
}

function coCachePipelineHtml(active = [], miss = false) {
  const a = dsSet(active);
  const box = (key, title, desc) => `<div class="co-flow-box ${a.has(key) ? "active" : ""} ${miss && key === "MISS" ? "danger" : ""}"><strong>${escapeHtml(title)}</strong><small>${escapeHtml(desc)}</small></div>`;
  return `<div class="co-cache-pipeline">${box("CPU","CPU 发出地址","读/写请求")}<span>→</span>${box("SPLIT","拆分地址","Tag / Index / Offset")}<span>→</span>${box("LOOKUP","查 Cache","比较有效位和 Tag")}<span>→</span>${box(miss ? "MISS" : "HIT", miss ? "未命中" : "命中", miss ? "访问主存块" : "直接返回字")}</div>${miss ? `<div class="co-cache-miss-path">主存取整块 → 必要时选择牺牲行 → 写入 Cache → 把目标字交给 CPU</div>` : `<div class="co-cache-hit-path">Offset 选出块内目标字节/字，命中时间内返回 CPU</div>`}`;
}

function coMappingHtml(mode, activeBlock = 11) {
  const lines = Array.from({length:8}, (_, i) => i);
  const blocks = Array.from({length:16}, (_, i) => i);
  const selectedLine = activeBlock % 8;
  const selectedSet = activeBlock % 4;
  const blockHtml = blocks.map(b => `<span class="co-map-block ${b === activeBlock ? "active" : ""}">B${b}</span>`).join("");
  let cacheHtml = "";
  if (mode === "direct") {
    cacheHtml = lines.map(l => `<span class="co-map-line ${l === selectedLine ? "active" : ""}">L${l}</span>`).join("");
  } else if (mode === "full") {
    cacheHtml = lines.map(l => `<span class="co-map-line ${l === 5 ? "active" : ""}">L${l}</span>`).join("");
  } else {
    cacheHtml = Array.from({length:4}, (_, s) => `<div class="co-map-set ${s === selectedSet ? "active" : ""}"><b>组${s}</b><span>路0</span><span>路1</span></div>`).join("");
  }
  const formula = mode === "direct" ? `B${activeBlock} mod 8 = L${selectedLine}` : mode === "full" ? `B${activeBlock} 可放入任意 Cache 行（示意放入 L5）` : `B${activeBlock} mod 4 = 组${selectedSet}，组内任选一路`;
  return `<div class="co-mapping-stage"><div><h4>主存块</h4><div class="co-map-memory">${blockHtml}</div></div><div class="co-map-arrow">⇢</div><div><h4>Cache</h4><div class="${mode === "set" ? "co-map-sets" : "co-map-cache"}">${cacheHtml}</div></div></div><div class="co-mapping-formula">${formula}</div>`;
}

function coReplacementHtml(sequence, pos, frames, victim = null, hit = false, policy = "FIFO") {
  const seq = sequence.map((x, i) => `<span class="co-ref ${i === pos ? "active" : i < pos ? "visited" : ""}">${x}</span>`).join("");
  const fs = frames.map((x, i) => `<div class="co-frame ${i === victim ? "victim" : ""} ${x === sequence[pos] && hit ? "hit" : ""}"><small>行 ${i}</small><strong>${x ?? "空"}</strong></div>`).join("");
  return `<div class="co-replace-policy">${escapeHtml(policy)}</div><div class="co-reference-row">访问串：${seq}</div><div class="co-frame-row">${fs}</div><div class="co-replace-result ${hit ? "hit" : "miss"}">${hit ? "命中：不调块" : victim === null ? "缺失：装入空行" : `缺失：替换 Cache 行 ${victim}`}</div>`;
}

function simulateCachePolicy(sequence, frameCount, policy) {
  const frames = Array(frameCount).fill(null);
  const fifoQueue = [];
  const recent = [];
  const out = [];
  sequence.forEach((page, pos) => {
    const before = frames.slice();
    let hit = frames.includes(page), victim = null;
    if (hit) {
      if (policy === "LRU") {
        const k = recent.indexOf(page); if (k >= 0) recent.splice(k, 1); recent.push(page);
      }
    } else {
      let slot = frames.indexOf(null);
      if (slot < 0) {
        if (policy === "FIFO") {
          const old = fifoQueue.shift(); slot = frames.indexOf(old);
        } else {
          const old = recent.shift(); slot = frames.indexOf(old);
        }
        victim = slot;
      }
      frames[slot] = page;
      if (policy === "FIFO") fifoQueue.push(page);
      if (policy === "LRU") recent.push(page);
    }
    out.push({pos, page, before, frames: frames.slice(), hit, victim, order: policy === "FIFO" ? fifoQueue.slice() : recent.slice()});
  });
  return out;
}

function coDiskHtml(stage = "overview") {
  const seek = stage === "seek";
  const rotate = stage === "rotate";
  const transfer = stage === "transfer";
  return `<div class="co-disk-machine"><div class="co-platter ${rotate ? "spinning" : ""}"><div class="co-track t1"></div><div class="co-track t2"></div><div class="co-track t3"></div><div class="co-sector ${transfer ? "active" : ""}"></div><div class="co-spindle"></div></div><div class="co-disk-arm ${seek ? "seeking" : transfer ? "on-sector" : ""}"><span class="co-arm-base"></span><span class="co-arm-stick"></span><span class="co-head"></span></div><div class="co-disk-caption">${stage === "overview" ? "盘面被划分为磁道和扇区" : stage === "seek" ? "磁头径向移动到目标磁道" : stage === "rotate" ? "盘片旋转，等待目标扇区到磁头下方" : "目标扇区经过磁头，连续传输数据"}</div></div>`;
}

function coTimeBars(active = -1) {
  const items = [
    ["寻道时间", "5.00 ms", 50],
    ["平均旋转延迟", "4.17 ms", 42],
    ["传输时间", "0.60 ms", 12]
  ];
  return `<div class="co-time-bars">${items.map((x,i)=>`<div class="co-time-bar-row ${i===active?'active':''}"><span>${x[0]}</span><div style="--w:${x[2]}%"></div><b>${x[1]}</b></div>`).join("")}<div class="co-total-time">总访问时间 = 9.77 ms</div></div>`;
}

function coInstructionFlowHtml(active = "PC", mode = "sequential") {
  const seq = mode === "sequential" ? ["100","104","108","112"] : ["100","104","220","224"];
  return `<div class="co-pc-flow">${seq.map((x,i)=>`<div class="co-pc-node ${active===x?'active':''} ${i < seq.indexOf(active)?'visited':''}"><small>地址</small><strong>${x}</strong><span>${i===1 && mode!=="sequential" ? (mode === "relative" ? "BR +116" : "JMP 220") : "指令"}</span></div>${i<seq.length-1?`<b>${i===1&&mode!=="sequential"?"跳转":"+4"} →</b>`:""}`).join("")}</div>`;
}

function coAddressingHtml(mode, active = []) {
  const a = dsSet(active);
  const box = (key, text, sub) => `<div class="co-ea-box ${a.has(key)?'active':''}"><strong>${escapeHtml(text)}</strong><small>${escapeHtml(sub)}</small></div>`;
  const op = x => `<b class="co-ea-op">${x}</b>`;
  const configs = {
    immediate: [box("IR","指令地址码 = 25","操作数就在指令中"), op("⇒"), box("DATA","操作数 = 25","不再访存")],
    direct: [box("A","A = 1000","形式地址"), op("⇒"), box("MEM","M[1000] = 25","EA=A，访存一次")],
    indirect: [box("A","A = 1000","形式地址"), op("⇒"), box("PTR","M[1000] = 2000","得到有效地址"), op("⇒"), box("MEM","M[2000] = 25","再取操作数")],
    register: [box("R1","R1 = 25","寄存器号在指令中"), op("⇒"), box("DATA","操作数 = R1","速度快")],
    regind: [box("R1","R1 = 2000","R1 保存地址"), op("⇒"), box("MEM","M[2000] = 25","EA=(R1)")],
    indexed: [box("A","A = 1000","基准地址"), op("+"), box("IX","IX = 20","变址寄存器"), op("⇒"), box("MEM","EA=1020","数组元素")],
    base: [box("BR","BR = 4000","基址寄存器"), op("+"), box("A","A = 120","位移量"), op("⇒"), box("MEM","EA=4120","程序重定位")],
    relative: [box("PC","PC = 108","下一条地址"), op("+"), box("A","A = -24","有符号位移"), op("⇒"), box("MEM","EA=84","分支目标")]
  };
  return `<div class="co-ea-flow">${configs[mode].join("")}</div>`;
}

function coStackFrameHtml(stage = 0) {
  const all = [
    ["高地址", "调用者已有栈帧", 0],
    ["参数 / 溢出实参", "arg", 1],
    ["返回地址", "ret", 2],
    ["旧 FP / RBP", "saved", 3],
    ["被调用者保存寄存器", "saved", 4],
    ["局部变量与临时量", "local", 5],
    ["低地址（栈向下增长）", "bottom", 6]
  ];
  return `<div class="co-stack-frame"><div class="co-stack-arrow">SP ↓</div>${all.map(([label,kind,s])=>`<div class="co-stack-slot ${kind} ${s===stage?'active':''} ${s>stage && s<6?'future':''}">${label}</div>`).join("")}</div>`;
}

function buildCOMemoryComponentsSteps() {
  const steps = [];
  const rows = [
    ["存储元", "保存 1 bit", "SRAM 常用触发器，DRAM 常用电容"],
    ["存储矩阵", "存储元按行列排列", "一行通常对应一个存储字"],
    ["地址译码器", "把 MAR 中地址译成一条字线", "m 位地址可选择 2^m 行"],
    ["读出/写入电路", "通过位线感知或写入 0/1", "读时送 MDR，写时数据来自 MDR"],
    ["控制电路", "接收 CS、WE/RD 等信号", "决定选片与读写时序"],
    ["完整读操作", "MAR→译码→选中字线→位线→MDR", "数据再经总线送 CPU"]
  ];
  rows.forEach((r,i)=>addStep(steps, i, `${r[0]}：${r[1]}。`, dsLayout("存储器内部组成", `${coMemoryArrayHtml(i>=2?2:-1,i>=3?5:-1,i===3?"read":"idle")}<div class="co-memory-io ${i>=3?'active':''}">MDR / 数据输入输出缓冲</div>`, [
    {title:"组成部件", html:dsTable(["部件","作用","408抓手"], rows, {activeRows:[i]})},
    {title:"读操作数据流", html:dsChips(["MAR给地址","地址译码","字线选中","位线读出","MDR接收","CPU取数据"], i===5?["MAR给地址","地址译码","字线选中","位线读出","MDR接收","CPU取数据"]:i===2?["MAR给地址","地址译码","字线选中"]:i===3?["位线读出","MDR接收"]:[])}
  ]), r[2]));
  return steps;
}

function buildCOSRAMChipDesignSteps() {
  const steps = [];
  const rows = [
    ["目标存储器", "4K×8 bit", "共 4096 个字，每字 8 位"],
    ["已有芯片", "1K×4 bit", "每片 1024 个字，每字 4 位"],
    ["字扩展倍数", "4K÷1K=4", "需要 4 组，扩大地址空间"],
    ["位扩展倍数", "8÷4=2", "每组 2 片并联，拼成 8 位字长"],
    ["芯片总数", "4×2=8 片", "总片数=字扩展×位扩展"],
    ["地址线连接", "A0~A9 接所有芯片；A10~A11 接 2-4 译码器", "低位片内寻址，高位产生片选"],
    ["数据线连接", "每组选中两片分别接 D3~D0 与 D7~D4", "两片同读同写，组成一个 8 位字"]
  ];
  rows.forEach((r,i)=>addStep(steps, i, `${r[0]}：${r[1]}。`, dsLayout("用 1K×4 SRAM 组成 4K×8 存储器", `<div class="co-formula">总片数 = (4K / 1K) × (8 / 4) = 4 × 2 = 8</div>${coChipBankHtml(i>=5?2:i>=2?0:-1)}`, [
    {title:"计算步骤", html:dsTable(["步骤","计算","含义"], rows, {activeRows:[i]})},
    {title:"口诀", html:dsChips(["先看字数：做字扩展","再看位数：做位扩展","低位地址并联","高位地址译码片选","数据线按位分组"], i===2?["先看字数：做字扩展"]:i===3?["再看位数：做位扩展"]:i===5?["低位地址并联","高位地址译码片选"]:i===6?["数据线按位分组"]:[])}
  ]), r[2]));
  return steps;
}

function buildCOMemoryCPUConnectionSteps() {
  const steps = [];
  const rows = [
    ["地址总线", "CPU→主存，通常单向", "MAR 位数与地址总线宽度相关"],
    ["数据总线", "CPU↔主存，双向", "宽度影响一次传送的位数"],
    ["控制总线", "读、写、片选、就绪等", "决定总线周期与操作方向"],
    ["地址译码/片选", "高位地址选择存储芯片，低位地址选择片内单元", "多芯片扩展必考"],
    ["主存读周期", "CPU给地址和读信号，主存把数据送数据总线", "M[MAR]→MDR"],
    ["主存写周期", "CPU给地址、数据和写信号，主存写入", "MDR→M[MAR]"]
  ];
  const active = [["CPU","ADDR","MEM"],["CPU","DATA","MEM"],["CPU","CTRL","MEM"],["ADDR","CTRL","MEM"],["CPU","ADDR","CTRL","MEM","DATA"],["CPU","ADDR","DATA","CTRL","MEM"]];
  rows.forEach((r,i)=>addStep(steps, i, `${r[0]}：${r[1]}。`, dsLayout("CPU 与主存的三组总线", coCpuMemoryBusHtml(active[i]), [
    {title:"连接规则", html:dsTable(["连接","方向/作用","考点"], rows, {activeRows:[i]})},
    {title:"微操作", html:dsChips(["MAR→地址总线","MDR↔数据总线","CU→读/写信号","M[MAR]→MDR","MDR→M[MAR]"], i===4?["MAR→地址总线","CU→读/写信号","M[MAR]→MDR"]:i===5?["MAR→地址总线","MDR↔数据总线","CU→读/写信号","MDR→M[MAR]"]:[])}
  ]), r[2]));
  return steps;
}

function buildCOCacheWorkflowSteps() {
  const steps = [];
  const rows = [
    ["1. CPU 请求", "CPU 发出主存地址", "Cache 对程序透明"],
    ["2. 地址拆分", "拆成 Tag / Index(或组号) / Offset", "映射方式决定字段"],
    ["3. 查找目录", "检查有效位并比较 Tag", "组相联需并行比较多路"],
    ["4. 命中", "用 Offset 选择块内数据直接返回", "命中时间很短"],
    ["5. 未命中", "向主存请求整个数据块", "利用空间局部性"],
    ["6. 装入 Cache", "有空行就装入；无空行按替换算法选牺牲行", "全相联/组相联要替换算法"],
    ["7. 写策略", "写直达或写回；写分配或非写分配", "写回需脏位 dirty"],
    ["8. 返回 CPU", "目标字交给 CPU，后续相邻访问可能命中", "局部性提高命中率"]
  ];
  const active = [["CPU"],["CPU","SPLIT"],["CPU","SPLIT","LOOKUP"],["CPU","SPLIT","LOOKUP","HIT"],["CPU","SPLIT","LOOKUP","MISS"],["LOOKUP","MISS"],["LOOKUP","MISS"],["CPU","SPLIT","LOOKUP","HIT"]];
  rows.forEach((r,i)=>addStep(steps, Math.min(i,7), `${r[0]}：${r[1]}。`, dsLayout("Cache 工作全过程", coCachePipelineHtml(active[i], i>=4 && i<=6), [
    {title:"步骤表", html:dsTable(["阶段","动作","408考点"], rows, {activeRows:[i]})},
    {title:"性能公式", html:`<div class="co-formula small">平均访存时间 = Cache命中时间 + 未命中率×未命中附加代价</div>${dsChips(["时间局部性","空间局部性","有效位 valid","脏位 dirty","写回/写直达"], i===4?["空间局部性"]:i===7?["时间局部性","空间局部性"]:i===6?["脏位 dirty","写回/写直达"]:[])}`}
  ]), r[2]));
  return steps;
}

function buildCOCacheMappingEnhancedSteps() {
  const steps = [];
  const rows = [
    ["直接映射", "主存块号 mod Cache行数", "固定一行，简单快，冲突多"],
    ["全相联映射", "任意主存块可放任意行", "所有Tag并行比较，成本高"],
    ["2路组相联", "主存块号 mod 组数，组内任选一路", "折中，组内需替换"],
    ["块内偏移", "log2(块大小)", "三种方式都需要"],
    ["直接映射行号", "log2(Cache行数)", "地址中含行号字段"],
    ["组相联组号", "log2(组数)", "组数=行数/路数"],
    ["Tag 位数", "地址总位数−其余字段", "全相联没有行号/组号"],
    ["命中判断", "valid=1 且 Tag 相等", "组相联比较组内各路"]
  ];
  const modes = ["direct","direct","full","set","direct","set","full","set"];
  rows.forEach((r,i)=>addStep(steps, i, `${r[0]}：${r[1]}。`, dsLayout("主存块 B11 映射到 Cache", coMappingHtml(modes[i],11), [
    {title:"三种映射对比", html:dsTable(["方式","位置规则","特点"], rows.slice(0,3), {activeRows:[Math.min(i,2)]})},
    {title:"地址字段", html:dsTable(["考点","计算","提示"], rows.slice(3), {activeRows:i>=3?[i-3]:[]})},
    {title:"地址格式速记", html:dsChips(["直接：Tag|Line|Offset","全相联：Tag|Offset","组相联：Tag|Set|Offset"], modes[i]==="direct"?["直接：Tag|Line|Offset"]:modes[i]==="full"?["全相联：Tag|Offset"]:["组相联：Tag|Set|Offset"])}
  ]), r[2]));
  return steps;
}

function buildCOCacheReplacementSteps() {
  const steps = [];
  const sequence = [1,2,3,1,4,2,5];
  const introRows = [
    ["FIFO", "淘汰最早调入的块", "命中不改变先后顺序"],
    ["LRU", "淘汰最长时间未被访问的块", "命中会更新最近使用顺序"],
    ["随机", "随机选择牺牲行", "硬件简单，结果不唯一"]
  ];
  addStep(steps, 0, "当组内或全相联 Cache 没有空行时，需要选择一个块替换。直接映射不需要选择，因为位置唯一。", dsLayout("Cache 替换算法", coReplacementHtml(sequence,0,[null,null,null],null,false,"算法总览"), [
    {title:"算法对比", html:dsTable(["算法","淘汰规则","易错点"],introRows,{})},
    {title:"适用范围", html:dsChips(["直接映射：无选择","全相联：全Cache选择","组相联：只在目标组内选择"],["全相联：全Cache选择","组相联：只在目标组内选择"])}
  ]), "例子使用 3 个 Cache 行，访问串 1 2 3 1 4 2 5。");
  const fifo = simulateCachePolicy(sequence,3,"FIFO");
  fifo.forEach((s,idx)=>addStep(steps, 1, `FIFO 访问 ${s.page}：${s.hit?"已在 Cache 中，命中且队列顺序不变":"未命中，按最早进入顺序装入或替换"}。`, dsLayout("FIFO：先进先出", coReplacementHtml(sequence,s.pos,s.frames,s.victim,s.hit,"FIFO"), [
    {title:"当前状态", html:dsTable(["项目","值"],[["访问块",s.page],["Cache",s.frames.join(" | ")],["调入先后",s.order.join(" → ")||"空"],["结果",s.hit?"命中":"缺失"]],{activeRows:[3]})},
    {title:"规则", html:dsChips(["看调入时间","命中不更新","队首最老","淘汰队首"],s.hit?["命中不更新"]:["看调入时间","队首最老","淘汰队首"])}
  ]), s.hit?"FIFO 命中不改变队列。":s.victim===null?"还有空行，直接装入。":`淘汰行 ${s.victim}。`));
  const lru = simulateCachePolicy(sequence,3,"LRU");
  lru.forEach((s,idx)=>addStep(steps, 2, `LRU 访问 ${s.page}：${s.hit?"命中，把它更新为最近使用":"未命中，淘汰最长时间未使用的块"}。`, dsLayout("LRU：最近最少使用", coReplacementHtml(sequence,s.pos,s.frames,s.victim,s.hit,"LRU"), [
    {title:"当前状态", html:dsTable(["项目","值"],[["访问块",s.page],["Cache",s.frames.join(" | ")],["从最久到最近",s.order.join(" → ")||"空"],["结果",s.hit?"命中并更新":"缺失"]],{activeRows:[3]})},
    {title:"规则", html:dsChips(["看最近访问时间","命中要更新","最左最久未用","淘汰最久未用"],s.hit?["命中要更新"]:["看最近访问时间","最左最久未用","淘汰最久未用"])}
  ]), s.hit?"命中的块移动到最近使用端。":s.victim===null?"还有空行，直接装入。":`淘汰行 ${s.victim}。`));
  addStep(steps, 3, "随机替换在候选行中随机挑选牺牲块，硬件开销低，但同一访问串的结果可能不同。", dsLayout("随机替换", coReplacementHtml(sequence,6,[5,2,4],0,false,"Random（一次可能结果）"), [
    {title:"算法对比", html:dsTable(["算法","命中后是否更新状态","替换依据"],[ ["FIFO","否","最早调入"],["LRU","是","最久未访问"],["Random","否","随机数"] ],{activeRows:[2]})},
    {title:"408 高频结论", html:dsChips(["FIFO可能出现Belady异常","LRU利用时间局部性","随机结果不唯一","直接映射无替换算法"],["LRU利用时间局部性","直接映射无替换算法"])}
  ]), "题目若未给随机结果，通常不会要求唯一替换过程。");
  return steps;
}

function buildCODiskWorkingSteps() {
  const steps = [];
  const rows = [
    ["盘片与盘面", "磁性介质高速旋转", "每个盘面通常有一个磁头"],
    ["磁道", "同心圆环", "同半径的多盘面磁道形成柱面"],
    ["扇区", "磁道被切分的弧段", "磁盘读写的基本物理块"],
    ["寻道", "磁头沿半径移动到目标磁道", "对应寻道时间"],
    ["旋转等待", "等待目标扇区转到磁头下", "平均为半圈时间"],
    ["数据传输", "扇区经过磁头时连续读写", "对应传输时间"],
    ["柱面概念", "所有盘面上相同半径的磁道集合", "切换同柱面磁头无需移动磁臂"]
  ];
  const stages = ["overview","overview","overview","seek","rotate","transfer","overview"];
  rows.forEach((r,i)=>addStep(steps, i, `${r[0]}：${r[1]}。`, dsLayout("磁盘机械结构与一次读取", coDiskHtml(stages[i]), [
    {title:"结构与动作", html:dsTable(["概念","含义","对应考点"],rows,{activeRows:[i]})},
    {title:"一次读取顺序", html:dsChips(["定位柱面/磁道","选择磁头","等待扇区旋转到位","传输扇区数据"], i===3?["定位柱面/磁道"]:i===4?["等待扇区旋转到位"]:i===5?["传输扇区数据"]:i===6?["选择磁头"]:[])}
  ]), r[2]));
  return steps;
}

function buildCODiskAccessTimeSteps() {
  const steps = [];
  const rows = [
    ["寻道时间 Ts", "磁臂移动到目标磁道", "题目常直接给平均寻道时间 5 ms"],
    ["一圈时间", "60 / 转速(rpm)", "7200 rpm：60/7200 s=8.33 ms"],
    ["平均旋转延迟 Tr", "一圈时间 / 2", "7200 rpm：4.17 ms"],
    ["传输时间 Tt", "读取扇区数 / 每秒可读扇区数", "本例给 0.60 ms"],
    ["总访问时间", "Ta=Ts+Tr+Tt", "5+4.17+0.60=9.77 ms"],
    ["连续多扇区", "同一磁道连续扇区通常只需一次寻道和旋转等待", "不要每个扇区都重复加 Ts、Tr"]
  ];
  rows.forEach((r,i)=>addStep(steps, i, `${r[0]}：${r[1]}。`, dsLayout("磁盘平均读取时间", `${coTimeBars(i===0?0:i===2?1:i===3?2:-1)}<div class="co-formula">Ta = Ts + Tr + Tt</div>`, [
    {title:"计算过程", html:dsTable(["项目","公式/含义","本例"],rows,{activeRows:[i]})},
    {title:"单位换算", html:dsChips(["rpm=转/分钟","60/rpm 得秒/圈","×1000 得毫秒","平均旋转=半圈","最后统一单位"], i===1?["rpm=转/分钟","60/rpm 得秒/圈","×1000 得毫秒"]:i===2?["平均旋转=半圈"]:["最后统一单位"])}
  ]), r[2]));
  return steps;
}

function buildCOInstructionAddressingSteps() {
  const steps = [];
  const rows = [
    ["顺序寻址", "PC自动加指令长度", "定长4B指令：PC←PC+4"],
    ["取指", "PC→MAR，读主存，IR←M[PC]", "PC随后指向下一条"],
    ["直接跳转", "PC←指令给出的目标地址", "JMP/CALL 类指令"],
    ["相对转移", "PC←当前PC+有符号位移", "条件分支常用，利于位置无关代码"],
    ["条件不成立", "继续使用顺序PC", "分支有 taken / not taken 两条路径"],
    ["条件成立", "把分支目标装入PC", "流水线中会引起控制相关"]
  ];
  const states = [ ["104","sequential"],["104","sequential"],["220","jump"],["220","relative"],["108","sequential"],["220","relative"] ];
  rows.forEach((r,i)=>addStep(steps, i, `${r[0]}：${r[1]}。`, dsLayout("指令地址如何产生", coInstructionFlowHtml(states[i][0],states[i][1]), [
    {title:"指令寻址方式", html:dsTable(["方式","PC如何变化","场景"],rows,{activeRows:[i]})},
    {title:"关键寄存器", html:dsChips(["PC：下一条指令地址","MAR：本次访存地址","IR：当前指令","分支目标地址"], i===1?["PC：下一条指令地址","MAR：本次访存地址","IR：当前指令"]:i>=2?["PC：下一条指令地址","分支目标地址"]:[])}
  ]), r[2]));
  return steps;
}

function buildCOOperandAddressingSteps() {
  const steps = [];
  const rows = [
    ["立即寻址", "操作数=A", "不访存，范围受地址码位数限制"],
    ["直接寻址", "EA=A", "取操作数访存1次"],
    ["间接寻址", "EA=(A)", "先取EA再取数，至少访存2次"],
    ["寄存器寻址", "操作数=(Ri)", "速度最快，寄存器数量有限"],
    ["寄存器间接", "EA=(Ri)", "寄存器保存主存地址"],
    ["变址寻址", "EA=A+(IX)", "数组遍历，A常不变、IX变化"],
    ["基址寻址", "EA=(BR)+A", "程序重定位，BR由系统管理"],
    ["相对寻址", "EA=(PC)+A", "转移指令、位置无关代码"]
  ];
  const modes = ["immediate","direct","indirect","register","regind","indexed","base","relative"];
  const active = [["IR","DATA"],["A","MEM"],["A","PTR","MEM"],["R1","DATA"],["R1","MEM"],["A","IX","MEM"],["BR","A","MEM"],["PC","A","MEM"]];
  rows.forEach((r,i)=>addStep(steps, i, `${r[0]}：${r[1]}。`, dsLayout("数据寻址与有效地址 EA", coAddressingHtml(modes[i],active[i]), [
    {title:"寻址方式对比", html:dsTable(["方式","有效地址/操作数","特点"],rows,{activeRows:[i]})},
    {title:"判断技巧", html:dsChips(["A表示形式地址","括号表示内容","EA是有效地址","立即数无EA","先数访存次数"], i===0?["立即数无EA"]:i===2?["括号表示内容","先数访存次数"]:["A表示形式地址","EA是有效地址"])}
  ]), r[2]));
  return steps;
}

function buildCOProcedureCallSteps() {
  const steps = [];
  const rows = [
    ["传递实参", "前若干参数放寄存器，其余放栈", "具体规则由调用约定决定"],
    ["CALL", "保存返回地址并把PC改为被调函数入口", "返回地址是CALL后的下一条指令"],
    ["函数序言", "保存旧FP和需保护寄存器", "建立新的栈帧"],
    ["分配局部变量", "SP向低地址移动", "局部数组、临时量位于当前栈帧"],
    ["执行函数体", "通过FP/SP加偏移访问参数和局部变量", "栈帧让地址相对稳定"],
    ["返回值", "通常放约定的返回值寄存器", "如通用架构中的R0/RAX一类"],
    ["函数尾声", "释放局部空间，恢复寄存器和旧FP", "SP回到调用前位置"],
    ["RET", "从栈/链接寄存器恢复返回地址到PC", "继续执行调用者下一条指令"]
  ];
  rows.forEach((r,i)=>addStep(steps, i, `${r[0]}：${r[1]}。`, dsLayout("过程调用的栈帧变化", coStackFrameHtml([1,2,3,5,5,5,3,2][i]), [
    {title:"机器级过程", html:dsTable(["阶段","机器动作","理解"],rows,{activeRows:[i]})},
    {title:"典型汇编序列", html:`<div class="co-asm"><div class="${i===0?'active':''}">mov arg_reg, value</div><div class="${i===1?'active':''}">call function</div><div class="${i===2?'active':''}">push fp; mov fp, sp</div><div class="${i===3?'active':''}">sub sp, local_size</div><div class="${i===5?'active':''}">mov return_reg, result</div><div class="${i===6?'active':''}">mov sp, fp; pop fp</div><div class="${i===7?'active':''}">ret</div></div>`},
    {title:"408抓手", html:dsChips(["返回地址","参数传递","保存现场","栈帧","局部变量","恢复现场"], i===1?["返回地址"]:i===2?["保存现场","栈帧"]:i===3?["局部变量"]:i>=6?["恢复现场"]:[])}
  ]), r[2]));
  return steps;
}

Object.assign(DEMO_LIBRARY, {
  co_memory_components: {
    title: "存储器基本组成与读写原理",
    category: "计算机组成原理 / 主存储器",
    code: [
      "MAR <- address;",
      "row <- AddressDecoder(MAR);",
      "wordline[row] <- 1;",
      "if (Read)  MDR <- SenseAmplifier(bitlines);",
      "if (Write) bitlines <- MDR;",
      "MemoryControl(CS, RD, WE);"
    ],
    examTips: ["存储元存1位，存储单元按地址整体访问。", "地址译码器选字线，读写电路通过位线交换数据。", "读操作通常是 MAR→译码→存储阵列→MDR。"],
    buildSteps: buildCOMemoryComponentsSteps,
  },
  co_sram_chip_design: {
    title: "SRAM 芯片组成存储器的计算方法",
    category: "计算机组成原理 / 存储器扩展",
    code: [
      "word_factor = target_words / chip_words;",
      "bit_factor  = target_width / chip_width;",
      "chip_count  = word_factor * bit_factor;",
      "A_low  -> every chip address pin;",
      "A_high -> decoder -> chip_select;",
      "data_pins of parallel chips form one word;"
    ],
    examTips: ["芯片数=字扩展倍数×位扩展倍数。", "低位地址接片内地址，高位地址经译码器产生片选。", "位扩展的芯片同时选中，分别连接不同数据位。"],
    buildSteps: buildCOSRAMChipDesignSteps,
  },
  co_memory_cpu_connection: {
    title: "主存与 CPU 的连接",
    category: "计算机组成原理 / 总线与主存",
    code: [
      "AddressBus <- MAR;",
      "DataBus <-> MDR;",
      "ControlBus <- {CS, Read, Write};",
      "if (Read)  MDR <- M[MAR];",
      "if (Write) M[MAR] <- MDR;"
    ],
    examTips: ["地址总线通常单向，数据总线双向。", "高位地址常用于片选，低位地址用于片内寻址。", "读写时序要同时看地址、数据和控制信号。"],
    buildSteps: buildCOMemoryCPUConnectionSteps,
  },
  co_cache_workflow: {
    title: "Cache 工作原理：命中与缺失",
    category: "计算机组成原理 / Cache",
    code: [
      "{tag, set_or_line, offset} = split(address);",
      "entry = Cache.lookup(set_or_line, tag);",
      "if (entry.valid && entry.tag == tag) return entry[offset];",
      "block = MainMemory.read_block(address);",
      "victim = choose_victim_if_needed();",
      "Cache.fill(victim, block);",
      "return Cache.read(offset);",
      "// write-through/write-back; write-allocate/no-write-allocate"
    ],
    examTips: ["Cache按块与主存交换，CPU按字或字节取数据。", "命中条件通常是有效位为1且Tag相等。", "写回法需要脏位；替换只发生在有多个候选行时。"],
    buildSteps: buildCOCacheWorkflowSteps,
  },
  co_cache_mapping: {
    title: "Cache 与主存三种映射方式",
    category: "计算机组成原理 / Cache 映射",
    code: [
      "direct_line = memory_block % cache_lines;",
      "fully_associative: memory_block -> any cache line;",
      "set = memory_block % number_of_sets;",
      "offset_bits = log2(block_size);",
      "line_bits = log2(cache_lines);",
      "set_bits = log2(number_of_sets);",
      "tag_bits = address_bits - other_fields;",
      "hit = valid && tag_match;"
    ],
    examTips: ["直接映射：块号模行数。", "全相联：任意行，无行号字段。", "组相联：块号模组数，组内相联；组数=总行数/路数。"],
    buildSteps: buildCOCacheMappingEnhancedSteps,
  },
  co_cache_replacement: {
    title: "Cache 替换算法：FIFO、LRU、随机",
    category: "计算机组成原理 / Cache 替换",
    code: [
      "if (mapping == direct) no_replacement_choice;",
      "FIFO: victim = earliest_loaded_line;",
      "LRU:  victim = least_recently_used_line;",
      "Random: victim = random_candidate;"
    ],
    examTips: ["直接映射没有替换算法选择。", "FIFO命中不更新顺序，LRU命中会更新最近使用状态。", "组相联只在目标组内选择牺牲行。"],
    buildSteps: buildCOCacheReplacementSteps,
  },
  co_disk_working: {
    title: "磁盘存储器工作原理",
    category: "计算机组成原理 / 外存储器",
    code: [
      "seek(target_track);",
      "select_head(target_surface);",
      "wait_until(target_sector_under_head);",
      "transfer(sector_data);",
      "// cylinder = same-radius tracks on all surfaces"
    ],
    examTips: ["磁道是同心圆，扇区是磁道上的弧段，柱面是同半径磁道集合。", "磁盘访问顺序：寻道→旋转等待→传输。", "机械动作导致磁盘随机访问远慢于内存。"],
    buildSteps: buildCODiskWorkingSteps,
  },
  co_disk_access_time: {
    title: "磁盘读取时间的计算",
    category: "计算机组成原理 / 磁盘性能",
    code: [
      "rotation_period = 60 / rpm;",
      "average_rotational_latency = rotation_period / 2;",
      "transfer_time = data_size / transfer_rate;",
      "access_time = seek_time + rotational_latency + transfer_time;"
    ],
    examTips: ["rpm是每分钟转数，先算一圈时间再除2。", "总访问时间通常=寻道+旋转延迟+传输。", "连续扇区读取一般不要为每个扇区重复计算寻道和旋转等待。"],
    buildSteps: buildCODiskAccessTimeSteps,
  },
  co_instruction_addressing: {
    title: "指令寻址：顺序寻址与跳跃寻址",
    category: "计算机组成原理 / 指令系统",
    code: [
      "IR <- M[PC];",
      "PC <- PC + instruction_length;",
      "if (JUMP) PC <- target;",
      "if (BRANCH && condition) PC <- PC + signed_displacement;",
      "else continue sequential PC;"
    ],
    examTips: ["顺序寻址靠PC自动增加。", "跳跃寻址由转移类指令修改PC。", "相对转移通常用当前/下一条PC加有符号位移，按题目定义判断基准。"],
    buildSteps: buildCOInstructionAddressingSteps,
  },
  co_operand_addressing: {
    title: "数据寻址方式与有效地址 EA",
    category: "计算机组成原理 / 指令系统",
    code: [
      "Immediate: operand = A;",
      "Direct:    EA = A;",
      "Indirect:  EA = M[A];",
      "Register:  operand = R[i];",
      "RegIndirect: EA = R[i];",
      "Indexed:   EA = A + IX;",
      "Base:      EA = BR + A;",
      "Relative:  EA = PC + A;"
    ],
    examTips: ["括号表示取内容，不加括号常表示地址或编号。", "变址适合数组：形式地址不变、变址寄存器变化。", "基址利于重定位：基址寄存器由系统管理；相对寻址常用于转移。"],
    buildSteps: buildCOOperandAddressingSteps,
  },
  co_procedure_call: {
    title: "过程调用的机器级表示",
    category: "计算机组成原理 / 指令与程序执行",
    code: [
      "place_arguments(registers_or_stack);",
      "CALL function;        // save return address, change PC",
      "PUSH FP; FP <- SP;    // establish stack frame",
      "SP <- SP - local_size;",
      "execute_function_body();",
      "return_register <- result;",
      "SP <- FP; POP FP;     // restore caller state",
      "RET;                  // PC <- return address"
    ],
    examTips: ["过程调用要抓住参数、返回地址、保存现场、局部变量、返回值。", "栈通常向低地址增长，但以具体体系结构为准。", "CALL改变PC并保存返回地址，RET恢复返回地址继续执行。"],
    buildSteps: buildCOProcedureCallSteps,
  }
});
