let bluetoothDevice = null;
let bluetoothCharacteristic = null;

const SERVICE_UUID = 0xffe0;
const CHARACTERISTIC_UUID = 0xffe1;
const DOUBLE_TAP_DELAY = 350;

const connectBtn = document.getElementById("connectBtn");
const connectLabel = connectBtn.querySelector(".connect-label");
const statusText = document.getElementById("status");
const lastCommandText = document.getElementById("lastCommand");
const continuousModeText = document.getElementById("continuousMode");
const controlButtons = document.querySelectorAll(".control-btn");
const cartStage = document.getElementById("cartStage");
const cart = document.getElementById("cart");
const motionLabel = document.getElementById("motionLabel");
const collisionStatus = document.getElementById("collisionStatus");
const collisionDot = document.getElementById("collisionDot");

const COMMAND_LABELS = {
  W: "W - Frente",
  S: "S - Re",
  A: "A - Girar esquerda",
  D: "D - Girar direita",
  Q: "Q - Frente + esquerda",
  E: "E - Frente + direita",
  Z: "Z - Re + esquerda",
  C: "C - Re + direita",
  0: "0 - Parar",
};

const COMMAND_VISUALS = {
  W: { label: "Frente", dx: 0, dy: -1, rotation: 0 },
  S: { label: "Re", dx: 0, dy: 1, rotation: 180 },
  A: { label: "Esquerda", dx: -1, dy: 0, rotation: -90 },
  D: { label: "Direita", dx: 1, dy: 0, rotation: 90 },
  Q: { label: "Frente Esq", dx: -1, dy: -1, rotation: -45 },
  E: { label: "Frente Dir", dx: 1, dy: -1, rotation: 45 },
  Z: { label: "Re Esq", dx: -1, dy: 1, rotation: -135 },
  C: { label: "Re Dir", dx: 1, dy: 1, rotation: 135 },
  0: { label: "Parado", dx: 0, dy: 0, rotation: 0 },
};

const activeManualInputs = new Map();
const ignoredPointerUps = new Set();
const lastTapTimes = new Map();

let activeContinuous = null;
let lastSentCommand = "";
let visualCommand = "0";
let cartPosition = { x: 0, y: 0 };
let lastAnimationTime = null;

connectBtn.addEventListener("click", connectBluetooth);

function setConnectLabel(text) {
  connectLabel.textContent = text;
}

async function connectBluetooth() {
  try {
    statusText.textContent = "Status: procurando HC-08...";

    bluetoothDevice = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: [SERVICE_UUID],
    });

    bluetoothDevice.addEventListener("gattserverdisconnected", onDisconnected);

    const server = await bluetoothDevice.gatt.connect();
    const service = await server.getPrimaryService(SERVICE_UUID);

    bluetoothCharacteristic = await service.getCharacteristic(CHARACTERISTIC_UUID);

    statusText.textContent = `Status: conectado em ${bluetoothDevice.name || "HC-08"}`;
    setConnectLabel("Bluetooth conectado");
    connectBtn.disabled = true;
  } catch (error) {
    console.error(error);
    statusText.textContent = "Status: erro ao conectar";
  }
}

function onDisconnected() {
  bluetoothCharacteristic = null;
  setConnectLabel("Conectar Bluetooth");
  connectBtn.disabled = false;
  deactivateContinuousMode();
  activeManualInputs.clear();
  lastSentCommand = "";
  if (lastCommandText) {
    lastCommandText.textContent = "Ultimo comando: nenhum";
  }
  statusText.textContent = "Status: desconectado";
}

function getButtonCommandCode(button) {
  if (button.dataset.code) {
    return button.dataset.code;
  }

  if (button.dataset.command) {
    return button.dataset.command;
  }

  return button.textContent.trim().toUpperCase();
}

function getLogicalCommands(button) {
  const combo = button.dataset.combo;

  if (combo) {
    return combo.split(",").map((value) => value.trim().toUpperCase());
  }

  return button.dataset.command ? [button.dataset.command] : [];
}

function buildBaseCommandSet() {
  const baseCommands = new Set();

  activeManualInputs.forEach((commands) => {
    commands.forEach((command) => baseCommands.add(command));
  });

  if (baseCommands.size === 0 && activeContinuous) {
    activeContinuous.commands.forEach((command) => baseCommands.add(command));
  }

  return baseCommands;
}

function resolveCommandFromSet(commandSet) {
  const w = commandSet.has("W");
  const a = commandSet.has("A");
  const s = commandSet.has("S");
  const d = commandSet.has("D");

  if (w && a) return "Q";
  if (w && d) return "E";
  if (s && a) return "Z";
  if (s && d) return "C";

  if (w) return "W";
  if (s) return "S";
  if (a) return "A";
  if (d) return "D";

  return "0";
}

function getResolvedCommand() {
  return resolveCommandFromSet(buildBaseCommandSet());
}

function updateContinuousModeText() {
  const label = activeContinuous
    ? COMMAND_LABELS[activeContinuous.commandCode]
    : "nenhum";

  if (continuousModeText) {
    continuousModeText.textContent = `Modo continuo: ${label}`;
  }
}

function updateContinuousButtonHighlight() {
  controlButtons.forEach((button) => {
    button.classList.remove("continuous-active");
  });

  if (activeContinuous?.button) {
    activeContinuous.button.classList.add("continuous-active");
  }
}

function setActiveControl(command) {
  controlButtons.forEach((button) => {
    button.classList.toggle(
      "is-active",
      command !== "0" && getButtonCommandCode(button) === command
    );
  });
}

function setCartVisualCommand(command) {
  const visual = COMMAND_VISUALS[command] || COMMAND_VISUALS["0"];

  visualCommand = command;
  document.body.dataset.command = command;
  document.body.dataset.motion = command === "0" ? "idle" : "moving";
  motionLabel.textContent = visual.label;
  cart.style.setProperty("--cart-rotate", `${visual.rotation}deg`);
  setActiveControl(command);
}

function getMovementDistance() {
  const stageRect = cartStage.getBoundingClientRect();
  const shortestSide = Math.min(stageRect.width, stageRect.height);

  return Math.max(30, Math.min(46, shortestSide * 0.2));
}

function getCartTarget() {
  const visual = COMMAND_VISUALS[visualCommand] || COMMAND_VISUALS["0"];
  const distance = getMovementDistance();

  return {
    x: visual.dx * distance,
    y: visual.dy * distance,
  };
}

function renderCartPosition() {
  cart.style.setProperty("--cart-x", `${cartPosition.x}px`);
  cart.style.setProperty("--cart-y", `${cartPosition.y}px`);
}

function animateCart(timestamp) {
  if (!lastAnimationTime) {
    lastAnimationTime = timestamp;
  }

  const elapsedSeconds = Math.min((timestamp - lastAnimationTime) / 1000, 0.05);
  const target = getCartTarget();
  const settleTime = visualCommand === "0" ? 0.2 : 0.14;
  const ease = 1 - Math.pow(0.001, elapsedSeconds / settleTime);

  lastAnimationTime = timestamp;

  cartPosition.x += (target.x - cartPosition.x) * ease;
  cartPosition.y += (target.y - cartPosition.y) * ease;

  if (Math.abs(target.x - cartPosition.x) < 0.1) {
    cartPosition.x = target.x;
  }

  if (Math.abs(target.y - cartPosition.y) < 0.1) {
    cartPosition.y = target.y;
  }

  renderCartPosition();
  requestAnimationFrame(animateCart);
}

function deactivateContinuousMode() {
  activeContinuous = null;
  updateContinuousModeText();
  updateContinuousButtonHighlight();
}

function activateContinuousMode(button) {
  activeManualInputs.clear();
  activeContinuous = {
    button,
    commandCode: getButtonCommandCode(button),
    commands: getLogicalCommands(button),
  };

  updateContinuousModeText();
  updateContinuousButtonHighlight();
  updateMovement();
}

async function updateMovement(force = false) {
  const command = getResolvedCommand();

  setCartVisualCommand(command);

  if (!force && command === lastSentCommand) {
    return;
  }

  lastSentCommand = command;
  await sendCommand(command);
}

async function sendCommand(command) {
  const commandLabel = COMMAND_LABELS[command] || command;

  if (lastCommandText) {
    lastCommandText.textContent = `Ultimo comando: ${commandLabel}`;
  }

  if (!bluetoothCharacteristic) {
    statusText.textContent = "Status: conecte o Bluetooth primeiro";
    return;
  }

  try {
    const data = new TextEncoder().encode(command);

    if (
      bluetoothCharacteristic.properties.writeWithoutResponse &&
      bluetoothCharacteristic.writeValueWithoutResponse
    ) {
      await bluetoothCharacteristic.writeValueWithoutResponse(data);
    } else if (bluetoothCharacteristic.writeValueWithResponse) {
      await bluetoothCharacteristic.writeValueWithResponse(data);
    } else {
      await bluetoothCharacteristic.writeValue(data);
    }
  } catch (error) {
    console.error(error);
    statusText.textContent = "Status: erro ao enviar comando";
  }
}

function setCollisionDetected(isDetected) {
  if (!collisionStatus || !collisionDot) {
    return;
  }

  collisionStatus.textContent = isDetected
    ? "Colisão detectada"
    : "Nenhuma colisão detectada";
  collisionDot.classList.toggle("is-detected", isDetected);
}

window.setCollisionDetected = setCollisionDetected;

function cancelContinuousForManualInput() {
  if (!activeContinuous) {
    return;
  }

  deactivateContinuousMode();
}

function handleStopAction() {
  deactivateContinuousMode();
  activeManualInputs.clear();
  setCartVisualCommand("0");
  lastSentCommand = "0";
  sendCommand("0");
}

function isDoubleTap(button) {
  const commandCode = getButtonCommandCode(button);
  const lastTapTime = lastTapTimes.get(commandCode) || 0;

  return Date.now() - lastTapTime <= DOUBLE_TAP_DELAY;
}

function rememberTap(button) {
  const commandCode = getButtonCommandCode(button);
  lastTapTimes.set(commandCode, Date.now());
}

function handlePointerDown(event) {
  const button = event.currentTarget;
  const commandCode = getButtonCommandCode(button);

  event.preventDefault();
  button.setPointerCapture(event.pointerId);

  if (commandCode === "0") {
    ignoredPointerUps.add(event.pointerId);
    handleStopAction();
    return;
  }

  if (isDoubleTap(button)) {
    ignoredPointerUps.add(event.pointerId);
    activateContinuousMode(button);
    rememberTap(button);
    return;
  }

  cancelContinuousForManualInput();
  activeManualInputs.set(event.pointerId, getLogicalCommands(button));
  updateMovement();
}

function handlePointerUp(event) {
  const button = event.currentTarget;

  event.preventDefault();

  if (ignoredPointerUps.has(event.pointerId)) {
    ignoredPointerUps.delete(event.pointerId);
    return;
  }

  activeManualInputs.delete(event.pointerId);
  rememberTap(button);
  updateMovement();
}

function handlePointerCancel(event) {
  if (ignoredPointerUps.has(event.pointerId)) {
    ignoredPointerUps.delete(event.pointerId);
    return;
  }

  activeManualInputs.delete(event.pointerId);
  updateMovement();
}

controlButtons.forEach((button) => {
  button.addEventListener("pointerdown", handlePointerDown);
  button.addEventListener("pointerup", handlePointerUp);
  button.addEventListener("pointercancel", handlePointerCancel);
});

document.addEventListener("keydown", (event) => {
  const key = event.key.toUpperCase();

  if (["W", "A", "S", "D"].includes(key) && !event.repeat) {
    cancelContinuousForManualInput();
    activeManualInputs.set(`key:${key}`, [key]);
    updateMovement();
  }

  if (event.code === "Space") {
    handleStopAction();
  }
});

document.addEventListener("keyup", (event) => {
  const key = event.key.toUpperCase();

  if (["W", "A", "S", "D"].includes(key)) {
    activeManualInputs.delete(`key:${key}`);
    updateMovement();
  }
});

updateContinuousModeText();
setCartVisualCommand("0");
renderCartPosition();
requestAnimationFrame(animateCart);
