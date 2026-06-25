(function() {
  try {
    if (document.getElementById("__CAO_USER__")) return;
    var d = window.__INITIAL_STATE__;
    if (d && d.meta && d.meta.currentUser) {
      var h = d.meta.currentUser.screen_name || d.meta.currentUser.screenName;
      if (h) {
        var el = document.createElement("div");
        el.id = "__CAO_USER__";
        el.style.display = "none";
        el.textContent = JSON.stringify({ handle: h.toLowerCase() });
        document.documentElement.appendChild(el);
      }
    }
  } catch(e) {}
})();
