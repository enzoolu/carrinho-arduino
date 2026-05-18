let bluetoothDevice = null;
let bluetoothCharacteristic = null;

const SERVICE_UUID = 0xffe0;
const CHARACTERISTIC_UUID = 0xffe1;
const DOUBLE_TAP_DELAY = 350;

const COLLISION_COMMANDS = new Set(["W", "Q", "E"]);
const GAMEPAD_DEADZONE = 0.45;

const connectBtn = document.getElementById("connectBtn");
const connectLabel = connectBtn?.querySelector(".connect-label");
const statusText = document.getElementById("status");
const lastCommandText = document.getElementById("lastCommand");
const continuousModeText = document.getElementById("continuousMode");
const controlButtons = document.querySelectorAll(".control-btn");
const cartStage = document.getElementById("cartStage");
const cart = document.getElementById("cart");
const motionLabel = document.getElementById("motionLabel");
const collisionStatus = document.getElementById("collisionStatus");
const collisionDot = document.getElementById("collisionDot");

let gamepadStatusText = document.getElementById("gamepadStatus");

if (!gamepadStatusText) {
  gamepadStatusText = document.createElement("p");
  gamepadStatusText.id = "gamepadStatus";
  gamepadStatusText.className = "status";
  gamepadStatusText.textContent = "Controle PS5: aguardando";

  const statusStack = document.querySelector(".status-stack");
  if (statusStack) {
    statusStack.appendChild(gamepadStatusText);
  }
}

const COMMAND_LABELS = {
  W: "W - Frente",
  S: "S - Ré",
  A: "A - Girar esquerda",
  D: "D - Girar direita",
  Q: "Q - Frente esquerda",
  E: "E - Frente direita",
  Z: "Z - Ré esquerda",
  C: "C - Ré direita",
  0: "0 - Parar",
};

const COMMAND_VISUALS = {
  W: { label: "Frente", dx: 0, dy: -1, rotation: 0 },
  S: { label: "Ré", dx: 0, dy: 1, rotation: 180 },
  A: { label: "Girar esquerda", dx: -1, dy: 0, rotation: -90 },
  D: { label: "Girar direita", dx: 1, dy: 0, rotation: 90 },
  Q: { label: "Frente esquerda", dx: -1, dy: -1, rotation: -45 },
  E: { label: "Frente direita", dx: 1, dy: -1, rotation: 45 },
  Z: { label: "Ré esquerda", dx: -1, dy: 1, rotation: -135 },
  C: { label: "Ré direita", dx: 1, dy: 1, rotation: 135 },
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
let bluetoothBuffer = "";
let gamepadCommand = "0";
let lastGamepadIndex = null;

connectBtn?.addEventListener("click", connectBluetooth);

function setConnectLabel(text) {
  if (connectLabel) {
    connectLabel.textContent = text;
  }
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

    if (bluetoothCharacteristic.properties.notify) {
      await bluetoothCharacteristic.startNotifications();

      bluetoothCharacteristic.addEventListener(
        "characteristicvaluechanged",
        handleBluetoothMessage
      );
    }

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
  bluetoothBuffer = "";

  if (lastCommandText) {
    lastCommandText.textContent = "Último comando: nenhum";
  }

  statusText.textContent = "Status: desconectado";
}

function handleBluetoothMessage(event) {
  const value = event.target.value;
  const text = new TextDecoder().decode(value);

  bluetoothBuffer += text;

  const lines = bluetoothBuffer.split(/\r?\n/);
  bluetoothBuffer = lines.pop() || "";

  lines.forEach((line) => {
    processArduinoLine(line.trim());
  });
}

function processArduinoLine(line) {
  if (!line) {
    return;
  }

  const distanceMatch = line.match(/DIST:(\d+)/);
  const collisionMatch = line.match(/COLLISION:([01])/);

  if (collisionMatch) {
    const isDetected = collisionMatch[1] === "1";
    setCollisionDetected(isDetected);

    if (isDetected && COLLISION_COMMANDS.has(lastSentCommand)) {
      handleStopAction(false);
    }

    return;
  }

  if (distanceMatch) {
    const distance = Number(distanceMatch[1]);
    setCollisionDetected(distance < 10);
  }
}

function getButtonCommandCode(button) {
  if (button.dataset.command) {
    return button.dataset.command.trim().toUpperCase();
  }

  if (button.dataset.code) {
    return button.dataset.code.trim().toUpperCase();
  }

  return button.textContent.trim().toUpperCase();
}

function getCurrentManualCommand() {
  const values = Array.from(activeManualInputs.values());

  if (values.length === 0) {
    return null;
  }

  return values[values.length - 1];
}

function getResolvedCommand() {
  const manualCommand = getCurrentManualCommand();

  if (manualCommand) {
    return manualCommand;
  }

  if (gamepadCommand !== "0") {
    return gamepadCommand;
  }

  if (activeContinuous) {
    return activeContinuous.commandCode;
  }

  return "0";
}

function updateContinuousModeText() {
  const label = activeContinuous
    ? COMMAND_LABELS[activeContinuous.commandCode]
    : "nenhum";

  if (continuousModeText) {
    continuousModeText.textContent = `Modo contínuo: ${label}`;
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

function setButtonPressed(button, isPressed) {
  button.classList.toggle("is-pressed", isPressed);
  button.setAttribute("aria-pressed", String(isPressed));
}

function setKeyboardButtonPressed(command, isPressed) {
  controlButtons.forEach((button) => {
    if (getButtonCommandCode(button) === command) {
      setButtonPressed(button, isPressed);
    }
  });
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

  if (motionLabel) {
    motionLabel.textContent = visual.label;
  }

  if (cart) {
    cart.style.setProperty("--cart-rotate", `${visual.rotation}deg`);
  }

  setActiveControl(command);
}

function getMovementDistance() {
  if (!cartStage) {
    return 36;
  }

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
  if (!cart) {
    return;
  }

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
    lastCommandText.textContent = `Último comando: ${commandLabel}`;
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

function handleStopAction(sendStopCommand = true) {
  deactivateContinuousMode();
  activeManualInputs.clear();
  gamepadCommand = "0";
  setGamepadStatus("Controle PS5: parado");
  setCartVisualCommand("0");
  lastSentCommand = "0";

  if (sendStopCommand) {
    sendCommand("0");
  }
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
  setButtonPressed(button, true);
  button.setPointerCapture(event.pointerId);

  if (commandCode === "0") {
    ignoredPointerUps.add(event.pointerId);
    handleStopAction(true);
    return;
  }

  if (isDoubleTap(button)) {
    ignoredPointerUps.add(event.pointerId);
    activateContinuousMode(button);
    rememberTap(button);
    return;
  }

  cancelContinuousForManualInput();
  activeManualInputs.set(event.pointerId, commandCode);
  updateMovement();
}

function handlePointerUp(event) {
  const button = event.currentTarget;

  event.preventDefault();
  setButtonPressed(button, false);

  if (ignoredPointerUps.has(event.pointerId)) {
    ignoredPointerUps.delete(event.pointerId);
    return;
  }

  activeManualInputs.delete(event.pointerId);
  rememberTap(button);
  updateMovement();
}

function handlePointerCancel(event) {
  const button = event.currentTarget;

  setButtonPressed(button, false);

  if (ignoredPointerUps.has(event.pointerId)) {
    ignoredPointerUps.delete(event.pointerId);
    return;
  }

  activeManualInputs.delete(event.pointerId);
  updateMovement();
}

function handlePointerLostCapture(event) {
  const button = event.currentTarget;

  setButtonPressed(button, false);

  if (activeManualInputs.delete(event.pointerId)) {
    updateMovement();
  }
}

controlButtons.forEach((button) => {
  button.setAttribute("aria-pressed", "false");
  button.addEventListener("pointerdown", handlePointerDown);
  button.addEventListener("pointerup", handlePointerUp);
  button.addEventListener("pointercancel", handlePointerCancel);
  button.addEventListener("lostpointercapture", handlePointerLostCapture);
});

document.addEventListener("keydown", (event) => {
  const key = event.key.toUpperCase();
  const allowedKeys = ["W", "A", "S", "D", "Q", "E", "Z", "C"];

  if (allowedKeys.includes(key) && !event.repeat) {
    cancelContinuousForManualInput();
    setKeyboardButtonPressed(key, true);
    activeManualInputs.set(`key:${key}`, key);
    updateMovement();
  }

  if (event.code === "Space") {
    handleStopAction(true);
  }
});

document.addEventListener("keyup", (event) => {
  const key = event.key.toUpperCase();
  const allowedKeys = ["W", "A", "S", "D", "Q", "E", "Z", "C"];

  if (allowedKeys.includes(key)) {
    setKeyboardButtonPressed(key, false);
    activeManualInputs.delete(`key:${key}`);
    updateMovement();
  }
});

function setGamepadStatus(text) {
  if (gamepadStatusText) {
    gamepadStatusText.textContent = text;
  }
}

function getFirstConnectedGamepad() {
  if (!navigator.getGamepads) {
    return null;
  }

  const gamepads = navigator.getGamepads();

  for (const gamepad of gamepads) {
    if (gamepad && gamepad.connected) {
      return gamepad;
    }
  }

  return null;
}

function axisToDirection(value) {
  if (value <= -GAMEPAD_DEADZONE) {
    return -1;
  }

  if (value >= GAMEPAD_DEADZONE) {
    return 1;
  }

  return 0;
}

function resolveGamepadCommand(gamepad) {
  if (!gamepad) {
    return "0";
  }

  const leftX = axisToDirection(gamepad.axes[0] || 0);
  const leftY = axisToDirection(gamepad.axes[1] || 0);

  const dpadUp = gamepad.buttons[12]?.pressed;
  const dpadDown = gamepad.buttons[13]?.pressed;
  const dpadLeft = gamepad.buttons[14]?.pressed;
  const dpadRight = gamepad.buttons[15]?.pressed;

  const stopPressed =
    gamepad.buttons[0]?.pressed ||
    gamepad.buttons[1]?.pressed ||
    gamepad.buttons[2]?.pressed ||
    gamepad.buttons[3]?.pressed ||
    gamepad.buttons[9]?.pressed;

  if (stopPressed) {
    return "0";
  }

  const x = dpadLeft ? -1 : dpadRight ? 1 : leftX;
  const y = dpadUp ? -1 : dpadDown ? 1 : leftY;

  if (y === -1 && x === -1) return "Q";
  if (y === -1 && x === 1) return "E";
  if (y === 1 && x === -1) return "Z";
  if (y === 1 && x === 1) return "C";

  if (y === -1) return "W";
  if (y === 1) return "S";
  if (x === -1) return "A";
  if (x === 1) return "D";

  return "0";
}

function updateGamepadControl() {
  const gamepad = getFirstConnectedGamepad();

  if (!gamepad) {
    if (lastGamepadIndex !== null) {
      lastGamepadIndex = null;
      gamepadCommand = "0";
      setGamepadStatus("Controle PS5: desconectado");
      updateMovement();
    }

    requestAnimationFrame(updateGamepadControl);
    return;
  }

  if (lastGamepadIndex !== gamepad.index) {
    lastGamepadIndex = gamepad.index;
    setGamepadStatus(`Controle PS5: conectado`);
  }

  const newCommand = resolveGamepadCommand(gamepad);

  if (newCommand !== gamepadCommand) {
    gamepadCommand = newCommand;

    const label = COMMAND_LABELS[gamepadCommand] || gamepadCommand;
    setGamepadStatus(`Controle PS5: ${label}`);

    if (activeManualInputs.size === 0) {
      if (gamepadCommand !== "0") {
        deactivateContinuousMode();
      }

      updateMovement();
    }
  }

  requestAnimationFrame(updateGamepadControl);
}

window.addEventListener("gamepadconnected", (event) => {
  lastGamepadIndex = event.gamepad.index;
  setGamepadStatus("Controle PS5: conectado");
});

window.addEventListener("gamepaddisconnected", () => {
  lastGamepadIndex = null;
  gamepadCommand = "0";
  setGamepadStatus("Controle PS5: desconectado");
  updateMovement();
});

updateContinuousModeText();
setCartVisualCommand("0");
setCollisionDetected(false);
renderCartPosition();
requestAnimationFrame(animateCart);
requestAnimationFrame(updateGamepadControl);