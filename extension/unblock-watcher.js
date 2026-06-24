(function() {
  "use strict";
  var origFetch = window.fetch;
  window.fetch = function(input, init) {
    return origFetch.apply(this, arguments).then(function(response) {
      try {
        var url = (typeof input === "string" ? input : (input && input.url) || "").split("?")[0];
        if (url.indexOf("/i/api/1.1/blocks/destroy.json") !== -1 && response.ok) {
          var fullUrl = typeof input === "string" ? input : (input && input.url) || "";
          var sp = new URL(fullUrl, window.location.origin).searchParams;
          var screenName = sp.get("screen_name");
          if (screenName) {
            window.dispatchEvent(new CustomEvent("cao-unblock", { detail: { handle: screenName.toLowerCase() } }));
          }
        }
      } catch (e) {}
      return response;
    });
  };
})();
