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
    constructor(name, code, id) {
      this.id = id;
      logger.log(`Window ID is ${id}.`);
    
      x("body").append(`
        <div class="xos-window" id="xos-window-${id}">
          <div class="xos-window-border">
            <span class="xos-window-name">${name}</span>
            <i class="fas fa-window-close xos-window-closer"></i>
          </div>
          <div class="xos-window-content">
            ${code}
          </div>
          <div class="xos-window-resizer"></div>
        </div>
      `);
      this.element = x(`#xos-window-${id}`);
      logger.log("Added window to DOM.");
    
      xAct(this.element.find(".xos-window-content"));
      logger.log("Parsed application code with xAct.");
      
      this.element.find(".xos-window-closer").click(this.close, this);
      logger.log("Registered close handler.");

      new xOSDraggableThing(this.element.find(".xos-window-border"), this.element);
      new xOSResizableThing(this.element.find(".xos-window-resizer"), this.element, this.element.find(".xos-window-content"));
    }
  
    close(that) {
      that.element.destroy();
      manager.windowClosed(that.id);
    }
  }

  class xOSManager {
    constructor(endpoint) {
      this.menu = new xOSMenu();
      this.bar = new xOSBar(this.menu);

      this.endpoint = endpoint.replace(/\/$/, "");

      this.applications = {};
      this.opened = 0;
      this.cache = {};
    }

    async loadApplications() {
      this.cache = {};
      logger.log("Cleared cache.");

      let applications = (await this.api("applications")).data;
      let newApplications = {};
      for (let application of applications) {
        newApplications[application.id] = {
          "name": application.name,
          "uri": application.uri
        };
      }
      logger.log("Fetched new applications.");

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
      let window = new xOSWindow(this.applications[id].name, code, windowId);

      this.bar.opened(window, windowId, this.applications[id].name);

      logger.log(`Done starting application ${id}.`);
    }

    windowClosed(id) {
      this.bar.closed(id);
    }

    async api(path, queries) {
      let ajaxResponse = await xJax(`${this.endpoint}/${path}`, queries);
      return JSON.parse(ajaxResponse);
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

    toggle(that) {
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
      this.handle.on("mousedown", this.down, this);
    }
  
    down(event, that) {
      console.log("down");
      event.preventDefault();
  
      that.pos3 = event.clientX;
      that.pos4 = event.clientY;
      
      x(document).on("mousemove", that.drag, that).on("mouseup", that.up, that);
    }
    drag(event, that) {
      console.log("drag");
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
      console.log("up");
      x(document).rmOn("mousemove", that.drag).rmOn("mouseup", that.up);
    }
  }

  class xOSResizableThing {
    constructor(elementWithEdge, toResizeE, toResizeS) {
      this.elementWithEdge = elementWithEdge;
      this.toResizeE = toResizeE;
      this.toResizeS = toResizeS;

      this.startX, this.startY, this.startWidth, this.startHeight = 0;

      this.elementWithEdge.on("mousedown", this.start, this);
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
  }

  window.manager = new xOSManager("https://xCloud--felixmattick.repl.co");
  window.logger = new xOSLogger();
})();

manager.loadApplications();