// Stand-ins for the chart and PDF libraries so the full UI can boot offline.
(function () {
  function Chart() { this.destroy = function () {}; }
  Chart.defaults = {};
  window.Chart = Chart;

  function JsPDF() {}
  JsPDF.prototype.setFontSize = function () {};
  JsPDF.prototype.setTextColor = function () {};
  JsPDF.prototype.text = function () {};
  JsPDF.prototype.autoTable = function () {};
  JsPDF.prototype.save = function () {};
  window.jspdf = { jsPDF: JsPDF };

  window.XLSX = {
    read: function () { return { SheetNames: ['Sheet1'], Sheets: { Sheet1: {} } }; },
    utils: { sheet_to_json: function () { return []; } },
  };
})();
