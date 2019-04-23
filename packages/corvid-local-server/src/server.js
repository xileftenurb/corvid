const fs = require("fs-extra");
const path = require("path");
const { initSiteManager: initLocalSiteManager } = require("corvid-local-site");
const logger = require("corvid-local-logger");

const startSocketServer = require("./server/startSocketServer");

const initServerApi = require("./socket-api");

const DEFAULT_EDITOR_PORT = 5000;
const DEFAULT_ADMIN_PORT = 3000;

const isEdit = options => options.type === "EDIT";
const isClone = options => options.type === "CLONE";
const isPullForce = options => options.type === "FORCE_PULL";
const isPullMove = options => options.type === "MOVE_PULL";
const isTest = () => process.env.NODE_ENV === "test";

const isEmptyDir = async path => {
  const contents = await fs.readdir(path);
  return contents.length === 0;
};

async function startServer(siteRootPath, options) {
  logger.info(`server starting at [${path.resolve(siteRootPath)}]`);
  const siteSrcPath = path.join(siteRootPath, "src");
  await fs.ensureDir(siteSrcPath);
  const isEmpty = await isEmptyDir(siteSrcPath);
  const isWix = await fs.exists(path.join(siteRootPath, ".corvidrc.json")); // TEMPORARY

  if (isEdit(options)) {
    if (!isWix) {
      logger.info(
        "Project not found. Open the Editor in the project's root folder."
      );
      throw new Error("CAN_NOT_EDIT_NON_WIX_SITE");
    }
    if (isEmpty) {
      logger.info("cannot edit an empty site directory");
      throw new Error("CAN_NOT_EDIT_EMPTY_SITE");
    }
  }

  if (isClone(options)) {
    if (!isWix) {
      logger.info(
        "Project not found. Open the Editor in the project's root folder."
      );
      throw new Error("CAN_NOT_CLONE_NON_WIX_SITE");
    }
    if (!isEmpty) {
      logger.info("Project already includes site files.");
      throw new Error("CAN_NOT_PULL_NON_EMPTY_SITE");
    }
  }

  if (isPullForce(options)) {
    if (!isWix) {
      logger.info(
        "Project not found. Pull site files to the project's root folder."
      );
      throw new Error("CAN_NOT_PULL_NON_WIX_SITE");
    }
    await fs.emptyDir(siteSrcPath);
  }

  if (isPullMove(options)) {
    if (!isWix) {
      logger.info(
        "Project not found. Pull site files to the project's root folder."
      );
      throw new Error("CAN_NOT_PULL_NON_WIX_SITE");
    }
    const snapshotFolder = path.join(
      siteRootPath,
      ".corvid",
      "snapshots",
      Date.now().toString()
    );

    await fs.move(siteSrcPath, snapshotFolder);
    await fs.emptyDir(siteSrcPath);
  }

  const localSite = await initLocalSiteManager(siteRootPath);
  const editorServer = await startSocketServer(
    DEFAULT_EDITOR_PORT,
    !isTest() && "https://editor.wix.com"
  );
  const adminServer = await startSocketServer(DEFAULT_ADMIN_PORT);

  adminServer.io.use((socket, next) => {
    if (socket.handshake.query.token === process.env.CORVID_SESSION_ID) {
      return next();
    }
    logger.warn("admin server authentication error");
    return next(new Error("authentication error"));
  });

  initServerApi(localSite, adminServer, editorServer, !isEdit(options));

  logger.info(
    `server listening at editor port [${editorServer.port}], admin port [${
      adminServer.port
    }]`
  );
  return {
    port: editorServer.port,
    adminPort: adminServer.port,
    close: () => {
      logger.info("server closing");
      localSite.close();
      editorServer.close();
      adminServer.close();
    }
  };
}

const startInCloneMode = (
  siteRootPath,
  { override = false, move = false } = {}
) => {
  if (override && move) {
    throw new Error("Only one of 'override' and 'move' may be set");
  }
  let type = "CLONE";
  if (move) {
    type = "MOVE_PULL";
  }
  if (override) {
    type = "FORCE_PULL";
  }
  return startServer(siteRootPath, {
    type
  });
};
const startInEditMode = siteRootPath =>
  startServer(siteRootPath, {
    type: "EDIT"
  });

module.exports = {
  startInCloneMode,
  startInEditMode
};