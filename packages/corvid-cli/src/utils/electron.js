/* eslint-disable no-console */
const path = require("path");
const childProcess = require("child_process");
const process = require("process");
const { BrowserWindow } = require("electron");
const client = require("socket.io-client");
const electron = require("electron");
const opn = require("opn");
const get_ = require("lodash/get");
const isObject_ = require("lodash/isObject");
const isFunction_ = require("lodash/isFunction");
const { serializeError, deserializeError } = require("serialize-error");
const { logger } = require("corvid-local-logger");
const { startInCloneMode, startInEditMode } = require("corvid-local-server");
const { readCorvidConfig } = require("../utils/corvid-config");
const { sendRequest } = require("../utils/socketIoHelpers");
const getMessage = require("../messages");
const disableHeadlessMode = !!process.env.CORVID_CLI_DISABLE_HEADLESS;
const shouldShowDevTools = !!process.env.CORVID_CLI_DEVTOOLS;

const beforeCloseDialogParams = {
  type: "question",
  title: getMessage("Electron_Prompt_Title_Not_Saved"),
  message: getMessage("Electron_Prompt_Message_Not_Saved"),
  buttons: [
    getMessage("Electron_Prompt_Leave_Not_Saved"),
    getMessage("Electron_Prompt_Cancel_Not_Saved")
  ]
};

const runningProcesses = [];

function launch(file, options = {}, callbacks = {}, args = []) {
  const childElectronProcess = childProcess.spawn(
    electron,
    [path.resolve(path.join(file)), ...args],
    {
      ...options,
      env: {
        ...process.env,
        ...options.env,
        FORCE_COLOR: "yes"
      },
      stdio: ["ignore", "inherit", "pipe", "ipc"]
    }
  );
  runningProcesses.push(childElectronProcess);

  function isJunk(data) {
    const text = data.toString();
    return text.includes("Could not instantiate: ProductRegistryImpl.Registry");
  }

  childElectronProcess.stderr.on("data", function(data) {
    if (!isJunk(data)) {
      logger.error(data.toString());
    }
  });

  const removeProcess = () =>
    runningProcesses.splice(runningProcesses.indexOf(childElectronProcess), 1);

  return new Promise((resolve, reject) => {
    childElectronProcess.on("message", message => {
      if (isObject_(message)) {
        if (message.event === "error") {
          const error = deserializeError(message.payload);
          if (isFunction_(callbacks.error)) {
            callbacks.error(error);
          } else {
            reject(error);
          }
        } else if (message.event && isFunction_(callbacks[message.event])) {
          callbacks[message.event](message.payload);
        }
      }
    });

    childElectronProcess.on("exit", (code, signal) => {
      removeProcess();
      code === 0 || (code === null && signal === "SIGTERM")
        ? resolve()
        : reject();
    });

    childElectronProcess.on("error", () => {
      removeProcess();
      reject();
    });
  });
}

async function connectToLocalServer(serverMode, serverArgs, win) {
  const server =
    serverMode === "edit"
      ? startInEditMode(".", serverArgs)
      : startInCloneMode(".", serverArgs);

  const {
    adminPort: localServerPort,
    adminToken: token,
    close: closeLocalServer
  } = await server;

  win.webContents.on("will-prevent-unload", event => {
    process.send({ event: "closingWithUnsavedChanges" });
    const choice = process.env.SKIP_UNSAVED_DIALOG
      ? 1
      : electron.dialog.showMessageBoxSync(win, beforeCloseDialogParams);
    const leave = choice === 0;
    if (leave) {
      event.preventDefault();
    }
  });

  win.on("closed", () => {
    closeLocalServer();
  });
  const clnt = client.connect(`http://localhost:${localServerPort}`, {
    query: { token }
  });

  await new Promise((resolve, reject) => {
    clnt.on("connect", () => {
      process.send({ event: "localServerConnected" });
      resolve();
    });

    setTimeout(reject, 1000);
  });

  clnt.on("editor-connected", () => {
    process.send({ event: "editorConnected" });
  });

  const localServerStatus = await sendRequest(clnt, "GET_STATUS");

  return { client: clnt, localServerStatus };
}

function openWindow(windowOptions = {}) {
  const win = new BrowserWindow({
    width: 1280,
    height: 960,
    ...windowOptions,
    show: windowOptions.show || disableHeadlessMode,
    webPreferences: { nativeWindowOpen: true }
  });
  try {
    if (shouldShowDevTools) {
      win.webContents.openDevTools();
    }
  } catch (_) {
    // couldn't open dev tools
  }

  const originalWindowHide = win.hide.bind(win);
  win.hide = (...args) => {
    if (!disableHeadlessMode) {
      return originalWindowHide(...args);
    }
  };
  return win;
}

async function openLocalEditorAndServer(app, windowOptions = {}) {
  const win = openWindow(windowOptions);

  win.webContents.on("new-window", (event, url) => {
    event.preventDefault();
    opn(url);
  });

  try {
    await new Promise(resolve => {
      setTimeout(resolve, shouldShowDevTools ? 1000 : 0);
    }).then(async () => {
      const corvidConfig = await readCorvidConfig(".");
      win.webContents
        .executeJavaScript(
          "(() => ({santaBase: window.santaBase, editorBase: window.editorBase}))()"
        )
        .then((result = {}) => {
          const getVersion = (url = "") => {
            if (!url) {
              return "";
            } else if (new URL(url).host === "localhost") {
              return "local";
            } else {
              return url.substring(url.lastIndexOf("/") + 1);
            }
          };
          const santaVersion = getVersion(get_(result, "santaBase"));
          const editorVersion = getVersion(get_(result, "editorBase"));
          logger.addSessionData({ santaVersion, editorVersion });
        })
        .catch(e => logger.warn(`error reading editor versions: ${e.message}`));
      if (app.serverMode) {
        const { client: clnt, localServerStatus } = await connectToLocalServer(
          app.serverMode,
          app.serverArgs,
          win
        );
        return app.handler(corvidConfig, win, clnt, localServerStatus);
      } else {
        return app.handler(corvidConfig, win);
      }
    });

    win.close();
  } catch (error) {
    process.send({
      event: "error",
      payload: serializeError(error)
    });
    throw error;
  }
}

module.exports = {
  openLocalEditorAndServer,
  openWindow,
  launch,
  killAllChildProcesses: () =>
    Promise.all(
      runningProcesses.splice(0).map(
        cp =>
          new Promise(resolve => {
            cp.on("exit", () => resolve());
            cp.kill();
          })
      )
    )
};
