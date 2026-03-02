const Export = (() => {
  function init() {
    const exportBtn = document.getElementById('export-btn');
    const exportMenu = document.getElementById('export-menu');

    exportBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      exportMenu.classList.toggle('hidden');
    });
    document.addEventListener('click', () => exportMenu.classList.add('hidden'));

    document.querySelectorAll('.export-option').forEach(btn => {
      btn.addEventListener('click', () => {
        const format = btn.dataset.format;
        if (format === 'csv') exportCSV();
        else if (format === 'pdf') exportPDF();
        exportMenu.classList.add('hidden');
      });
    });
  }

  function _getExportData() {
    const user = Auth.getUser();
    const stock = Store.getStockByOwner(user.id);
    return stock.map(s => {
      const product = Store.getProductById(s.productId);
      const location = Store.getLocationById(s.locationId);
      const cat = product ? Store.getCategoryById(product.categoryId) : null;
      const cost = product ? (product.costPrice || 0) : 0;
      const sell = product ? product.price : 0;
      const margin = sell > 0 ? ((sell - cost) / sell * 100).toFixed(1) : '0.0';
      return {
        Product: product ? product.name : 'Unknown',
        SKU: product ? product.sku : '-',
        Category: cat ? cat.name : 'Uncategorized',
        Location: location ? location.name : 'Unknown',
        Quantity: s.quantity,
        'Min Stock': s.minStock,
        'Cost Price': cost.toFixed(2),
        'Sell Price': sell.toFixed(2),
        'Margin %': margin,
        Status: s.quantity === 0 ? 'Out of Stock' : s.quantity <= s.minStock ? 'Low Stock' : 'In Stock',
      };
    });
  }

  function exportCSV() {
    const data = _getExportData();
    if (data.length === 0) { App.showToast('No stock to export', 'warning'); return; }
    const headers = Object.keys(data[0]);
    const rows = data.map(row => headers.map(h => {
      let val = String(row[h]);
      if (val.includes(',') || val.includes('"') || val.includes('\n')) val = '"' + val.replace(/"/g, '""') + '"';
      return val;
    }).join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    _downloadFile(csv, 'inventory-export.csv', 'text/csv');
    App.showToast('CSV exported', 'success');
  }

  function exportPDF() {
    const data = _getExportData();
    if (data.length === 0) { App.showToast('No stock to export', 'warning'); return; }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('landscape');

    doc.setFontSize(18); doc.setTextColor(30, 41, 59);
    doc.text('Inventory Report', 14, 20);
    doc.setFontSize(10); doc.setTextColor(100, 116, 139);
    const user = Auth.getUser();
    doc.text(`${user.name} | Generated ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, 14, 28);

    const totalCost = data.reduce((s, r) => s + r.Quantity * parseFloat(r['Cost Price']), 0);
    const totalSell = data.reduce((s, r) => s + r.Quantity * parseFloat(r['Sell Price']), 0);
    const totalProfit = totalSell - totalCost;
    doc.text(`Total Entries: ${data.length}  |  Stock: ${data.reduce((s, r) => s + r.Quantity, 0)}  |  Cost: ₹${totalCost.toFixed(2)}  |  Value: ₹${totalSell.toFixed(2)}  |  Profit: ₹${totalProfit.toFixed(2)}`, 14, 35);

    const headers = ['Product', 'SKU', 'Location', 'Qty', 'Cost', 'Sell', 'Margin', 'Status'];
    const tableData = data.map(r => [r.Product, r.SKU, r.Location, String(r.Quantity), '₹' + r['Cost Price'], '₹' + r['Sell Price'], r['Margin %'] + '%', r.Status]);

    doc.autoTable({
      head: [headers], body: tableData, startY: 42,
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [99, 102, 241], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' } },
    });
    doc.save('inventory-report.pdf');
    App.showToast('PDF exported', 'success');
  }

  function _downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return { init };
})();
