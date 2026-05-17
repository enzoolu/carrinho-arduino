let bluetoothDevice = null;
let bluetoothCharacteristic = null;

const SERVICE_UUID = 0xffe0;
const CHARACTERISTIC_UUID = 0xffe1;

const connectBtn = document.getElementById("connectBtn");
const statusText = document.getElementById("status");
const lastCommandText = document.getElementById("lastCommand");
const controlButtons = document.querySelectorAll(".control-btn");

connectBtn.addEventListener("click", connectBluetooth);

async function connectBluetooth() {
  try {
    statusText.textContent = "Status: procurando HC-08...";

    bluetoothDevice = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [SERVICE_UUID]
    });

    bluetoothDevice.addEventListener("gattserverdisconnected", onDisconnected);

    const server = await bluetoothDevice.gatt.connect();
    const service = await server.getPrimaryService(SERVICE_UUID);

    bluetoothCharacteristic = await service.getCharacteristic(CHARACTERISTIC_UUID);

    statusText.textContent = `Status: conectado em ${bluetoothDevice.name}`;
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
    sendCommand(command);
  });

  button.addEventListener("touchend", (event) => {
    event.preventDefault();

    if (command !== "0") {
      sendCommand("0");
    }
  });

  button.addEventListener("mousedown", () => {
    sendCommand(command);
  });

  button.addEventListener("mouseup", () => {
    if (command !== "0") {
      sendCommand("0");
    }
  });

  button.addEventListener("mouseleave", () => {
    if (command !== "0") {
      sendCommand("0");
    }
  });

  button.addEventListener("click", () => {
    if (command === "0") {
      sendCommand("0");
    }
  });
});

document.addEventListener("keydown", (event) => {
  const key = event.key.toUpperCase();

  if (["W", "A", "S", "D"].includes(key)) {
    sendCommand(key);
  }

  if (event.code === "Space") {
    sendCommand("0");
  }
});

document.addEventListener("keyup", (event) => {
  const key = event.key.toUpperCase();

  if (["W", "A", "S", "D"].includes(key)) {
    sendCommand("0");
  }
});