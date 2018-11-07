Sentry.init({ dsn: "https://27c74054843742d5ad692d229d30c1bf@sentry.io/1318270" });

(() => {
  class xOSLogger {
    log(message) {
      console.log(`xOS log: ${message}`);
    }

    warn(message) {
      console.log(`xOS warning: ${message}`);
    }

    error(message) {
      console.log(`xOS error: ${message}`);
    }
  }

  class xOSWindow {
    constructor(name, code, id, fixed, width, height) {
      this.id = id;
      logger.log(`Window ID is ${id}.`);

      if (!width) width = 300;
      if (!height) height = 250;
      this.width = width;
      this.height = height;

      code = xAct(code);
      x("body").append(`
        <div class="xos-window" id="xos-window-${id}">
          <div class="xos-window-border">
            <span class="xos-window-name">${name}</span>
            <i class="fas fa-window-close xos-window-closer xos-window-action"></i>
          </div>
          <div class="xos-window-content">
            ${code}
          </div>
        </div>
      `);
      this.element = x(`#xos-window-${id}`);
      this.element.style("width", this.width + "px").find(".xos-window-content").style("height", this.height + "px");
      if (!fixed) {
        this.element.append(`
          <div class="xos-window-resizer"></div>
        `);
        this.element.find(".xos-window-border").append(`
          <i class="fas fa-window-maximize xos-window-maximizer xos-window-action"></i>
        `);
      }
      logger.log("Added window to DOM.");

      this.element.find(".xos-window-closer").click(this.close, this);
      if (!fixed) this.element.find(".xos-window-maximizer").click(this.maximizeOrRestore, this);
      logger.log("Registered handlers.");

      this.draggabler = new xOSDraggableThing(this.element.find(".xos-window-border"), this.element);
      if (!fixed) {
        this.resizer = new xOSResizableThing(this.element.find(".xos-window-resizer"), this.element, this.element.find(".xos-window-content"), this.width, this.height);
      } else {
        this.resizer = {
          "enableResizing": () => {},
          "disableResizing": () => {}
        };
      }

      this.maximized = false;
    }

    close(that) {
      that.element.destroy();
      manager.windowClosed(that.id);
    }
    maximizeOrRestore(that) {
      if (that.maximized) {
        that.element.removeClass("xos-maximized");
        that.resizer.enableResizing(that.resizer);
        that.element.find(".xos-window-maximizer").removeClass("fa-window-restore").addClass("fa-window-maximize");
        that.draggabler.enableDragging(that.draggabler);

        that.maximized = false;
      } else {
        that.element.addClass("xos-maximized");
        that.resizer.disableResizing(that.resizer);
        that.element.find(".xos-window-maximizer").removeClass("fa-window-maximize").addClass("fa-window-restore");
        that.draggabler.disableDragging(that.draggabler);

        that.maximized = true;
      }
    }
  }

  class xOSManager {
    constructor(endpoint) {
      this.menu = new xOSMenu();
      this.bar = new xOSBar(this.menu);

      this.endpoint = endpoint.replace(/\/$/, "");

      this.applications = {};
      this.cache = {};
      this.backgrounds = {};

      this.opened = 0;
      this.windowOffsetTop = 30;
      this.windowOffsetLeft = 30;
      this.windowReachedBottom = 0;
    }

    async loadApplications() {
      this.cache = {};
      logger.log("Cleared cache.");

      let newApplications = {};
      for (let application of await this.api("applications")) {
        newApplications[application.id] = {
          "name": application.name,
          "uri": application.uri,
          "fixed": application.fixed,
          "width": application.width,
          "height": application.height
        };
      }
      logger.log("Fetched new applications.");

      this.menu.clear();
      for (let application in this.applications) {
        this.menu.remove(application.id);
        delete this.applications[application];
      }
      logger.log("Unloaded current applications.");

      for (let application in newApplications) {
        this.menu.add(application, newApplications[application].name)
        this.applications[application] = newApplications[application];
      }
      logger.log("Loaded new applications.");
    }
    async startApplication(id) {
      this.menu.element.style("display", "none");

      logger.log(`Starting application ${id}...`);
      if (!(id in this.applications)) {
        logger.warn(`${id} is not a loaded application.`);
        return;
      }

      let code = "";
      if (id in this.cache) {
        code = this.cache[id];
        logger.log("Code was in the cache, so used that.");
      } else {
        code = await xJax(this.applications[id].uri);
        this.cache[id] = code;
        logger.log("No code detected in the cache, so fetched it from server and cached it.");
      }

      let windowId = id + ++this.opened;
      let newWindow = new xOSWindow(this.applications[id].name, code, windowId, this.applications[id].fixed, this.applications[id].width, this.applications[id].height);
      newWindow.element
        .style("top", this.windowOffsetTop + "px")
        .style("left", this.windowOffsetLeft + "px");

      this.bar.opened(newWindow, windowId, this.applications[id].name);

      this.windowOffsetTop += 30;
      this.windowOffsetLeft += 30;
      if (this.windowOffsetTop >= window.innerHeight - 30) {
        this.windowOffsetTop = 30;
        this.windowOffsetLeft = 30 + 60 * ++this.windowReachedBottom;
      }
      if (this.windowOffsetLeft >= window.innerWidth - 30) {
        this.windowOffsetTop = 30;
        this.windowOffsetLeft = 30;
        this.windowReachedBottom = 0;
      }
      logger.log(`Done starting application ${id}.`);
    }
    async startStartupApplications() {
      for (let application of await this.api("applications/startup")) {
        await this.startApplication(application);
      }

      logger.log("Started startup applications.");
    }

    async loadBackgrounds() {
      this.backgrounds = {};
      for (let background of await this.api("backgrounds")) {
        this.backgrounds[background.id] = {
          "name": background.name,
          "value": background.value,
          "solid": background.solid,
          "englishType": background.solid ? "Solid Color" : "Image"
        };
      }
      logger.log("Fetched and loaded new backgrounds.");
    }
    setBackground(id) {
      if (id in this.backgrounds) {
        if (this.backgrounds[id].solid) {
          x("html").style("background-image", "").style("background-color", this.backgrounds[id].value);
        } else {
          x("html").style("background-image", `url("${this.backgrounds[id].value}")`);
        }
        db.set("xos-default-wallpaper", id);
        logger.log(`Set background to ${id}.`);
      } else {
        logger.warn(`${id} isn't a loaded background.`);
      }
    }
    async setDefaultBackground() {
      this.setBackground(await db.get("xos-default-wallpaper", Object.keys(this.backgrounds)[0]));

      logger.log("Set default background.");
    }

    windowClosed(id) {
      this.bar.closed(id);
    }

    async api(path, queries) {
      let ajaxResponse = await xJax(`${this.endpoint}/${path}`, queries);
      return JSON.parse(ajaxResponse).data;
    }
  }

  class xOSMenuButton {
    constructor(id, element) {
      this.id = id;
      this.element = element;
      this.element.click(this.click, this);
    }

    click(that) {
      manager.startApplication(that.id);
    }
    destroy() {
      this.element.destroy();
    }
  }

  class xOSMenu {
    constructor() {
      this.element = x("body").prepend(`
        <div id="xos-menu"></div>
      `).style("display", "none");

      this.buttons = {};
    }

    add(id, name) {
      let element = x("#xos-menu").append(`
        <button class="xos-menu-button">
          ${name}
        </button>
      `);
      this.buttons[id] = new xOSMenuButton(id, element);
    }
    remove(id) {
      if (id in this.buttons) {
        this.buttons[id].destroy();
        delete this.buttons[id];
      } else {
        logger.warn(`Application ${id} not in menu`);
      }
    }

    clear() {
      this.element.html("");
    }

    toggle(that) {
      if (that === undefined) that = this;
      that.element.style("display", that.element.style("display") === "none" ? "block" : "none");
    }
  }

  class xOSBar {
    constructor(menu) {
      this.element = x("body").prepend(`
        <div id="xos-bar">
          <i class="fas fa-compass" id="xos-menu-shower"></i>
          <span id="xos-bar-windows">
          </span>
        </div>
      `).find("#xos-bar-windows");
      this.menu = menu;
      x("#xos-menu-shower").click(this.menu.toggle, this.menu);
      this.open = {};
    }

    opened(window, application, name) {
      logger.log(`Window ${window.id} supposedly opened.`);
      this.open[window.id] = {
        "window": window,
        "application": application,
        "name": name
      };
      this.updateDisplay();
    }
    closed(window) {
      logger.log(`Window ${window} supposedly closed.`);
      if (!(window in this.open)) {
        logger.warn(`Window ${window} wasn't in the bar, so couldn't remove it.`);
        return;
      }
      delete this.open[window];
      this.updateDisplay();
    }

    updateDisplay() {
      let sorted = [];
      for (let item in this.open) {
        sorted.push({
          "window": this.open[item].window,
          "application": this.open[item].application,
          "name": this.open[item].name
        });
      }
      sorted = sorted.sort((a, b) => {
        if (a.application == b.application) {
          return (a.name < b.name) ? -1 : (a.name > b.name) ? 1 : 0;
        } else {
          return (a.application < b.application) ? -1 : 1;
        }
      });
      logger.log("Sorted bar items.");

      this.element.html("");
      logger.log("Cleared bar.");

      for (let item of sorted) {
        let created = this.element.append(`
          <span class="xos-bar-item">
            ${item.name}
          </span>
        `);
        created.click(item.window.focus);
      }
      logger.log("Updated bar.");
    }
  }

  class xOSDraggableThing {
    constructor(handle, drag) {
      this.handle = handle;
      this.toDrag = drag;

      this.pos1, this.pos2, this.pos3, this.pos4 = 0;
      this.enableDragging(this);
    }

    down(event, that) {
      event.preventDefault();

      that.pos3 = event.clientX;
      that.pos4 = event.clientY;

      x(document).on("mousemove", that.drag, that).on("mouseup", that.up, that);
    }
    drag(event, that) {
      event.preventDefault();

      that.pos1 = that.pos3 - event.clientX;
      that.pos2 = that.pos4 - event.clientY;
      that.pos3 = event.clientX;
      that.pos4 = event.clientY;

      that.toDrag
        .style("top", (that.toDrag.node.offsetTop - that.pos2) + "px")
        .style("left", (that.toDrag.node.offsetLeft - that.pos1) + "px");
    }
    up(_, that) {
      x(document).rmOn("mousemove", that.drag).rmOn("mouseup", that.up);
    }

    enableDragging(that) {
      that.handle.on("mousedown", that.down, that);
    }
    disableDragging(that) {
      that.handle.rmOn("mousedown", that.down);
    }
  }

  class xOSResizableThing {
    constructor(elementWithEdge, toResizeE, toResizeS) {
      this.elementWithEdge = elementWithEdge;
      this.toResizeE = toResizeE;
      this.toResizeS = toResizeS;

      this.startX, this.startY, this.startWidth, this.startHeight = 0;

      this.enableResizing(this);
    }

    start(event, that) {
      event.preventDefault();

      that.startX = event.clientX;
      that.startY = event.clientY;
      that.startWidth = parseInt(document.defaultView.getComputedStyle(that.toResizeE.node).width, 10);
      that.startHeight = parseInt(document.defaultView.getComputedStyle(that.toResizeS.node).height, 10);

      x(document).on("mousemove", that.middle, that).on("mouseup", that.end, that);
    }
    middle(_, that) {
      that.toResizeE.style("width", (that.startWidth + event.clientX - that.startX) + "px");
      that.toResizeS.style("height", (that.startHeight + event.clientY - that.startY) + "px");
    }
    end(_, that) {
      x(document).rmOn("mousemove", that.middle).rmOn("mouseup", that.end);
    }

    enableResizing(that) {
      that.elementWithEdge.on("mousedown", that.start, that);
    }
    disableResizing(that) {
      that.elementWithEdge.rmOn("mousedown", that.start);
    }
  }

  window.manager = new xOSManager("https://xcloud-heroku.herokuapp.com");
  window.logger = new xOSLogger();
  window.db = IronDB.IronDB;
  let check = false;
  (a => {if(/(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino|android|ipad|playbook|silk/i.test(a)||/1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i.test(a.substr(0,4))) check = true;})(navigator.userAgent||navigator.vendor||window.opera);
  if (check) x("body").addClass("xos-is-mobile");
})();

(async () => {
  await manager.loadApplications();
  await manager.loadBackgrounds();
  manager.setDefaultBackground();
  manager.startStartupApplications();
})();