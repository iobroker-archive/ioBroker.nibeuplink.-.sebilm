"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var utils = __toESM(require("@iobroker/adapter-core"));
var fs = __toESM(require("fs"));
var path = __toESM(require("path"));
var fetcher = __toESM(require("./nibe-fetcher"));
Date.prototype.today = function() {
  return this.getFullYear() + "-" + (this.getMonth() + 1 < 10 ? "0" : "") + (this.getMonth() + 1) + "-" + (this.getDate() < 10 ? "0" : "") + this.getDate();
};
Date.prototype.timeNow = function() {
  return (this.getHours() < 10 ? "0" : "") + this.getHours() + ":" + (this.getMinutes() < 10 ? "0" : "") + this.getMinutes() + ":" + (this.getSeconds() < 10 ? "0" : "") + this.getSeconds();
};
async function createDeviceAsync(adapter, path2, name) {
  await adapter.setObjectNotExistsAsync(path2, {
    type: "device",
    common: {
      name,
      role: "text"
    },
    native: {}
  });
}
async function createChannelAsync(adapter, path2, name) {
  await adapter.setObjectNotExistsAsync(path2, {
    type: "channel",
    common: {
      name,
      role: "text"
    },
    native: {}
  });
}
function setProperty(obj, propertyName, value) {
  obj[propertyName] = value;
}
class NibeUplink extends utils.Adapter {
  constructor(options = {}) {
    super({
      ...options,
      name: "nibeuplink"
    });
    this.on("ready", this.onReady.bind(this));
    this.on("stateChange", this.onStateChange.bind(this));
    this.on("unload", this.onUnload.bind(this));
  }
  /**
   * Is called when databases are connected and adapter received configuration.
   */
  async onReady() {
    this.log.info("Starting adapter.");
    let refreshInterval = this.config.Interval * 60;
    if (refreshInterval < 60) {
      refreshInterval = 60;
    }
    const identifier = this.config.Identifier.trim();
    const secret = this.config.Secret.trim();
    const callbackURL = this.config.CallbackURL.trim();
    const configured = this.config.Configured;
    let error = false;
    if (identifier == "" || identifier == null) {
      if (configured != false) {
        this.log.error("Missing Identifier in the settings!");
      }
      error = true;
    }
    if (secret == "" || secret == null) {
      if (configured != false) {
        this.log.error("Missing Secret in the settings!");
      }
      error = true;
    }
    if (callbackURL == "" || callbackURL == null) {
      if (configured != false) {
        this.log.error("Missing Callback URL in the settings!");
      }
      error = true;
    }
    if (this.config.SystemId == "" || this.config.SystemId == null) {
      if (configured != false) {
        this.log.error("Missing System ID in the settings!");
      }
      error = true;
    }
    if (error) {
      this.setState("info.connection", { val: false, ack: true });
      this.setState("info.currentError", { val: "Missing settings!", ack: true });
      return;
    }
    const dataDir = utils.getAbsoluteDefaultDataDir();
    let storeDir = path.join(dataDir, "nibeuplink");
    try {
      if (!fs.existsSync(storeDir)) {
        fs.mkdirSync(storeDir);
      }
    } catch (err) {
      this.log.error("Could not create storage directory (" + storeDir + "): " + err);
      storeDir = __dirname;
    }
    const storeFile = path.join(storeDir, "session." + this.instance + ".json");
    const manageId = !this.config.ManageId ? "MANAGE" : this.config.ManageId;
    this.fetcher = new fetcher.Fetcher(
      {
        clientId: identifier,
        clientSecret: secret,
        redirectUri: callbackURL,
        interval: refreshInterval,
        authCode: this.config.AuthCode.trim(),
        systemId: this.config.SystemId,
        language: this.config.Language,
        enableManage: this.config.EnableManageSupport,
        managedParameters: this.config.ManagedParameters,
        sessionStore: storeFile
      },
      this
    );
    this.fetcher.on("data", async (d) => {
      const data = d;
      this.log.debug("Data received.");
      this.log.silly(JSON.stringify(data, null, " "));
      this.setState("info.connection", { val: true, expire: refreshInterval + 30, ack: true });
      const newDate = /* @__PURE__ */ new Date();
      const datetime = newDate.today() + " " + newDate.timeNow();
      this.setState("info.updateTime", { val: datetime, ack: true });
      this.setState("info.currentError", { val: "", ack: true });
      data.unitData.forEach(async (unit) => {
        var _a;
        const unitPath = `UNIT_${unit.systemUnitId}`;
        await createDeviceAsync(this, unitPath, `${unit.name} (${unit.product})`);
        (_a = unit.categories) == null ? void 0 : _a.forEach(async (category) => {
          const categoryPath = `${unitPath}.${category.categoryId}`;
          await createChannelAsync(this, categoryPath, category.name);
          category.parameters.forEach(async (parameter) => {
            const key = parameter["key"];
            let title = parameter["title"];
            const designation = parameter["designation"];
            if (designation != null && designation != "") {
              title = `${title} (${designation})`;
            }
            const valuePath = `${categoryPath}.${key}`;
            await this.setObjectNotExistsAsync(valuePath, {
              type: "state",
              common: {
                name: title,
                type: "number",
                role: "value",
                unit: parameter["unit"],
                read: true,
                write: false
              },
              native: {}
            });
            await this.setStateAsync(valuePath, { val: parameter["value"], ack: true });
            const displayPath = `${categoryPath}.${key}_DISPLAY`;
            await this.setObjectNotExistsAsync(displayPath, {
              type: "state",
              common: {
                name: `${title} [Display]`,
                type: "string",
                role: "text",
                read: true,
                write: false
              },
              native: {}
            });
            await this.setStateAsync(displayPath, { val: parameter["displayValue"], ack: true });
            if (unit.systemUnitId == 0) {
              const oldValuePath = `${category.categoryId}.${key}`;
              this.getObject(oldValuePath, (err, obj) => {
                if (obj != null) {
                  this.setState(oldValuePath, { val: parameter["value"], ack: true });
                }
              });
              const oldDisplayPath = `${category.categoryId}.${key}_DISPLAY`;
              this.getObject(oldDisplayPath, (err, obj) => {
                if (obj != null) {
                  this.setState(oldDisplayPath, { val: parameter["displayValue"], ack: true });
                }
              });
            }
          });
        });
      });
      if (data.manageData != null) {
        const manageName = !this.config.ManageName ? "Manage" : this.config.ManageName;
        await createDeviceAsync(this, manageId, manageName);
        data.manageData.forEach(async (manageData) => {
          const unit = manageData.unit;
          manageData.parameters.forEach(async (parameter) => {
            const parameterId = parameter.name.toString();
            const conf = this.config.ManagedParameters.find((x) => x.unit == unit && x.parameter == parameterId);
            let key;
            if (conf != null && conf.id) {
              key = conf.id;
            } else {
              key = `${unit}_${parameterId}_${parameter.key}`;
            }
            let title;
            if (conf != null && conf.name) {
              title = conf.name;
            } else {
              title = parameter.title;
              const designation = parameter.designation;
              if (designation != null && designation != "") {
                title = `${title} (${designation})`;
              }
            }
            const valuePath = `${manageId}.${key}`;
            await this.setObjectNotExistsAsync(valuePath, {
              type: "state",
              common: {
                name: title,
                type: "number",
                role: "value",
                unit: parameter["unit"],
                read: true,
                write: true
              },
              native: {
                deviceUnit: unit,
                parameterId: parameter.parameterId,
                divideBy: parameter.divideBy
              }
            });
            await this.setStateAsync(valuePath, { val: parameter["value"], ack: true });
            const displayPath = `${manageId}.${key}_DISPLAY`;
            await this.setObjectNotExistsAsync(displayPath, {
              type: "state",
              common: {
                name: `${title} [Display]`,
                type: "string",
                role: "text",
                read: true,
                write: false
              },
              native: {}
            });
            await this.setStateAsync(displayPath, { val: parameter["displayValue"], ack: true });
          });
        });
      }
      this.log.debug("Data processed.");
    });
    this.fetcher.on("error", (data) => {
      this.log.error("" + data);
      this.setState("info.connection", { val: false, ack: true });
      const newDate = /* @__PURE__ */ new Date();
      const datetime = newDate.today() + " " + newDate.timeNow();
      this.setState("info.lastErrorTime", { val: datetime, ack: true });
      this.setState("info.lastError", { val: "" + data, ack: true });
      this.setState("info.currentError", { val: "" + data, ack: true });
    });
    if (this.config.EnableManageSupport === true) {
      this.subscribeStates(`${manageId}.*`);
    }
    this.log.info("Adapter started.");
  }
  /**
   * Is called when adapter shuts down - callback has to be called under any circumstances!
   */
  onUnload(callback) {
    try {
      if (this.fetcher != null) {
        this.fetcher.stop();
      }
      this.fetcher = void 0;
      this.setState("info.connection", { val: false, ack: true });
      this.log.info("Cleaned everything up...");
      callback();
    } catch (e) {
      callback();
    }
  }
  // If you need to react to object changes, uncomment the following block and the corresponding line in the constructor.
  // You also need to subscribe to the objects with `this.subscribeObjects`, similar to `this.subscribeStates`.
  // /**
  //  * Is called if a subscribed object changes
  //  */
  // private onObjectChange(id: string, obj: ioBroker.Object | null | undefined): void {
  //     if (obj) {
  //         // The object was changed
  //         this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
  //     } else {
  //         // The object was deleted
  //         this.log.info(`object ${id} deleted`);
  //     }
  // }
  /**
   * Is called if a subscribed state changes
   */
  async onStateChange(id, state) {
    if (state != null && state.ack === false && state.val != null && this.fetcher != null) {
      this.log.debug(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
      const obj = await this.getObjectAsync(id);
      if (obj != null && obj.native != null && obj.native.parameterId != null && obj.native.parameterId != "" && obj.native.deviceUnit != null && obj.native.deviceUnit != "") {
        const params = {};
        const parameterId = obj.native.parameterId;
        setProperty(params, parameterId.toString(), state.val.toString());
        try {
          await this.fetcher.setParams(obj.native.deviceUnit, params);
        } catch (error) {
          const errorPath = `${id}_ERROR`;
          await this.setObjectNotExistsAsync(errorPath, {
            type: "state",
            common: {
              name: `${obj.common.name} [Error]`,
              type: "string",
              role: "text",
              read: true,
              write: false
            },
            native: {}
          });
          const errorMessage = error instanceof Error ? error.message : String(error);
          await this.setStateAsync(errorPath, { val: errorMessage, ack: true });
        }
        await this.fetcher.getParams(obj.native.deviceUnit, [obj.native.parameterId]);
      }
    }
  }
  // If you need to accept messages in your adapter, uncomment the following block and the corresponding line in the constructor.
  // /**
  //  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
  //  * Using this method requires "common.messagebox" property to be set to true in io-package.json
  //  */
  // private onMessage(obj: ioBroker.Message): void {
  //     if (typeof obj === 'object' && obj.message) {
  //         if (obj.command === 'send') {
  //             // e.g. send email or pushover or whatever
  //             this.log.info('send command');
  //             // Send response in callback if required
  //             if (obj.callback) this.sendTo(obj.from, obj.command, 'Message received', obj.callback);
  //         }
  //     }
  // }
}
if (require.main !== module) {
  module.exports = (options) => new NibeUplink(options);
} else {
  (() => new NibeUplink())();
}
//# sourceMappingURL=main.js.map
