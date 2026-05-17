let bluetoothDevice = null;
let bluetoothCharacteristic = null;

const SERVICE_UUID = 0xffe0;
const CHARACTERISTIC_UUID = 0xffe1;

const connectBtn = document.getElementById("connectBtn");
const statusText = document.getElementById("status");
const lastCommandText = document.getElementById("lastCommand");
const controlButtons = document.querySelectorAll(".control-btn");

const pressedCommands = new Set();
let lastSentCommand = "";
const COMMAND_LABELS = {
  W: "W - Frente",
  S: "S - Ré",
  A: "A - Girar esquerda",
  D: "D - Girar direita",
  Q: "Q - Frente + esquerda",
  E: "E - Frente + direita",
  Z: "Z - Ré + esquerda",
  C: "C - Ré + direita",
  0: "0 - Parar",
};

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
  statusText.textContent = "Status: desconectado";
  connectBtn.textContent = "Conectar Bluetooth";
  connectBtn.disabled = false;
}

function resolveCommand() {
  const w = pressedCommands.has("W");
  const a = pressedCommands.has("A");
  const s = pressedCommands.has("S");
  const d = pressedCommands.has("D");

  if (w && a) return "Q"; // frente + esquerda
  if (w && d) return "E"; // frente + direita
  if (s && a) return "Z"; // ré + esquerda
  if (s && d) return "C"; // ré + direita

  if (w) return "W";
  if (s) return "S";
  if (a) return "A";
  if (d) return "D";

  return "0";
}

async function updateMovement() {
  const command = resolveCommand();

  if (command === lastSentCommand) {
    return;
  }

  lastSentCommand = command;
  await sendCommand(command);
}

async function sendCommand(command) {
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

    const commandLabel = COMMAND_LABELS[command] || command;
    lastCommandText.textContent = `Último comando: ${commandLabel}`;
  } catch (error) {
    console.error(error);
    statusText.textContent = "Status: erro ao enviar comando";
  }
}

function getLogicalCommands(button) {
  const combo = button.dataset.combo;

  if (combo) {
    return combo.split(",").map((value) => value.trim().toUpperCase());
  }

  const command = button.dataset.command;
  return command ? [command] : [];
}

function pressButton(button) {
  const commands = getLogicalCommands(button);

  if (commands.includes("0")) {
    pressedCommands.clear();
    sendCommand("0");
    lastSentCommand = "0";
    return;
  }

  commands.forEach((command) => pressedCommands.add(command));
  updateMovement();
}

function releaseButton(button) {
  const commands = getLogicalCommands(button);

  if (commands.includes("0")) {
    return;
  }

  commands.forEach((command) => pressedCommands.delete(command));
  updateMovement();
}

controlButtons.forEach((button) => {
  button.addEventListener("touchstart", (event) => {
    event.preventDefault();
    pressButton(button);
  });

  button.addEventListener("touchend", (event) => {
    event.preventDefault();
    releaseButton(button);
  });

  button.addEventListener("mousedown", () => {
    pressButton(button);
  });

  button.addEventListener("mouseup", () => {
    releaseButton(button);
  });

  button.addEventListener("mouseleave", () => {
    releaseButton(button);
  });
});

document.addEventListener("keydown", (event) => {
  const key = event.key.toUpperCase();

  if (["W", "A", "S", "D"].includes(key)) {
    pressedCommands.add(key);
    updateMovement();
  }

  if (event.code === "Space") {
    pressedCommands.clear();
    sendCommand("0");
    lastSentCommand = "0";
  }
});

document.addEventListener("keyup", (event) => {
  const key = event.key.toUpperCase();

  if (["W", "A", "S", "D"].includes(key)) {
    pressedCommands.delete(key);
    updateMovement();
  }
});
