(function () {
  "use strict";

  var table = document.getElementById("issues-table");
  if (!table) return;

  var thead = table.querySelector("thead");
  var tbody = table.querySelector("tbody");
  if (!thead || !tbody) return;

  var headers = thead.querySelectorAll("th[data-sort]");
  var sortKey = null;
  var sortDir = "asc";

  function getCellValue(row, key) {
    var index = Array.prototype.indexOf.call(headers, Array.prototype.find.call(headers, function (h) {
      return h.getAttribute("data-sort") === key;
    }));
    if (index < 0) return "";
    var cell = row.cells[index];
    return cell ? cell.textContent.trim() : "";
  }

  function compareRows(a, b, key) {
    var aVal = getCellValue(a, key);
    var bVal = getCellValue(b, key);

    if (key === "severity") {
      var aSev = severityOrder[aVal] || 0;
      var bSev = severityOrder[bVal] || 0;
      return sortDir === "asc" ? aSev - bSev : bSev - aSev;
    }

    var result = aVal.localeCompare(bVal, undefined, { sensitivity: "base" });
    return sortDir === "asc" ? result : -result;
  }

  function sortTable(key) {
    if (sortKey === key) {
      sortDir = sortDir === "asc" ? "desc" : "asc";
    } else {
      sortKey = key;
      sortDir = "asc";
    }

    headers.forEach(function (h) {
      h.classList.remove("sorted-asc", "sorted-desc");
      if (h.getAttribute("data-sort") === sortKey) {
        h.classList.add(sortDir === "asc" ? "sorted-asc" : "sorted-desc");
      }
    });

    var rows = Array.prototype.slice.call(tbody.querySelectorAll("tr"));
    rows.sort(function (a, b) {
      return compareRows(a, b, sortKey);
    });
    rows.forEach(function (row) {
      tbody.appendChild(row);
    });
  }

  headers.forEach(function (header) {
    header.addEventListener("click", function () {
      sortTable(header.getAttribute("data-sort"));
    });
  });
})();
