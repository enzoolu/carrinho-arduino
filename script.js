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

    lastCommandText.textContent = `Último comando: ${command}`;
  } catch (error) {
    console.error(error);
    statusText.textContent = "Status: erro ao enviar comando";
  }
}

controlButtons.forEach((button) => {
  const command = button.dataset.command;

  button.addEventListener("touchstart", (event) => {
    event.preventDefault();

    if (command === "0") {
      pressedCommands.clear();
      sendCommand("0");
      lastSentCommand = "0";
      return;
    }

    pressedCommands.add(command);
    updateMovement();
  });

  button.addEventListener("touchend", (event) => {
    event.preventDefault();

    if (command !== "0") {
      pressedCommands.delete(command);
      updateMovement();
    }
  });

  button.addEventListener("mousedown", () => {
    if (command === "0") {
      pressedCommands.clear();
      sendCommand("0");
      lastSentCommand = "0";
      return;
    }

    pressedCommands.add(command);
    updateMovement();
  });

  button.addEventListener("mouseup", () => {
    if (command !== "0") {
      pressedCommands.delete(command);
      updateMovement();
    }
  });

  button.addEventListener("mouseleave", () => {
    if (command !== "0") {
      pressedCommands.delete(command);
      updateMovement();
    }
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