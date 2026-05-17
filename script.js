let bluetoothDevice = null;
let bluetoothCharacteristic = null;

const SERVICE_UUID = 0xffe0;
const CHARACTERISTIC_UUID = 0xffe1;
const DOUBLE_TAP_DELAY = 350;

const connectBtn = document.getElementById("connectBtn");
const statusText = document.getElementById("status");
const lastCommandText = document.getElementById("lastCommand");
const continuousModeText = document.getElementById("continuousMode");
const controlButtons = document.querySelectorAll(".control-btn");

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

const activeManualInputs = new Map();
const ignoredPointerUps = new Set();
const lastTapTimes = new Map();

let activeContinuous = null;
let lastSentCommand = "";

connectBtn.addEventListener("click", connectBluetooth);

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
    connectBtn.textContent = "Bluetooth conectado";
    connectBtn.disabled = true;
  } catch (error) {
    console.error(error);
    statusText.textContent = "Status: erro ao conectar";
  }
}

function onDisconnected() {
  bluetoothCharacteristic = null;
  connectBtn.textContent = "Conectar Bluetooth";
  connectBtn.disabled = false;
  deactivateContinuousMode();
  activeManualInputs.clear();
  lastSentCommand = "";
  lastCommandText.textContent = "Ultimo comando: nenhum";
  statusText.textContent = "Status: desconectado";
}

function getButtonCommandCode(button) {
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

  continuousModeText.textContent = `Modo continuo: ${label}`;
}

function updateContinuousButtonHighlight() {
  controlButtons.forEach((button) => {
    button.classList.remove("continuous-active");
  });

  if (activeContinuous?.button) {
    activeContinuous.button.classList.add("continuous-active");
  }
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

  if (!force && command === lastSentCommand) {
    return;
  }

  lastSentCommand = command;
  await sendCommand(command);
}

async function sendCommand(command) {
  const commandLabel = COMMAND_LABELS[command] || command;
  lastCommandText.textContent = `Ultimo comando: ${commandLabel}`;

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

function cancelContinuousForManualInput() {
  if (!activeContinuous) {
    return;
  }

  deactivateContinuousMode();
}

function handleStopAction() {
  deactivateContinuousMode();
  activeManualInputs.clear();
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
