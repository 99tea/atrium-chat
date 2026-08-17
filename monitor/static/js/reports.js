// ==========================================
// MÓDULO DE EXPORTAÇÃO E RELATÓRIOS
// ==========================================

function getBase64ImageFromURL(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = url;
  });
}

// Filtra dinamicamente colunas visuais que não possuem texto nas linhas
function extractCleanTableData(table) {
  const head = [];
  const body = [];
  const trs = table.querySelectorAll('tr');

  trs.forEach((tr, rowIndex) => {
    const rowData = [];
    const cells = tr.querySelectorAll('th, td');
    cells.forEach(cell => rowData.push(cell.innerText.replace(/\n/g, ' ').trim()));

    if (rowIndex === 0 && table.querySelector('thead')) head.push(rowData);
    else if (rowData.length > 0) body.push(rowData);
  });

  if (head.length > 0 && body.length > 0) {
    const numCols = head[0].length;
    const colsToRemove = [];

    for (let c = 0; c < numCols; c++) {
      const isColEmpty = body.every(row => !row[c] || row[c].trim() === '');
      if (isColEmpty) colsToRemove.push(c);
    }

    for (let i = colsToRemove.length - 1; i >= 0; i--) {
      const c = colsToRemove[i];
      head[0].splice(c, 1);
      body.forEach(row => row.splice(c, 1));
    }
  }

  return { head, body };
}

async function exportToPDF() {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    showToast('Biblioteca PDF não carregada.', 'error');
    return;
  }

  showToast('Desenhando relatório... Aguarde.', 'success');

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('landscape');
  const route = location.hash.replace('#', '') || 'homepage';
  
  const now = new Date();
  const dateStr = now.toLocaleDateString('pt-BR');
  const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const brandColor = [143, 22, 27];
  const textColor = [40, 40, 40];
  const mutedColor = [120, 120, 120];

  let currentY = 15;

	let logoBase64 = null;
	  try {
	    const logoUrl = new URL('img/logo.png', window.location.href).href;
	    logoBase64 = await getBase64ImageFromURL(logoUrl);
	  } catch (e) {
	    console.warn('Falha ao carregar logo para o PDF', e);
	  }


  doc.setFillColor(...brandColor);
  doc.rect(0, 0, 297, 4, 'F');

  let titleStartX = 14;

  if (logoBase64) {
    doc.addImage(logoBase64, 'PNG', 14, currentY + 3, 10, 10);
    titleStartX = 28;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(...brandColor);
  doc.text('Australis', titleStartX, currentY + 10);
  
  const monitorX = titleStartX + (doc.getTextWidth('Australis') + 1.5);
  doc.setTextColor(...textColor);
  doc.text('Monitor', monitorX, currentY + 10);

  const subTitleX = monitorX + (doc.getTextWidth('Monitor') + 3);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(14);
  doc.text(`| Relatório Gerencial: ${route.toUpperCase()}`, subTitleX, currentY + 10);

  doc.setFontSize(10);
  doc.setTextColor(...mutedColor);
  doc.text(`Gerado em: ${dateStr} às ${timeStr}`, 283, currentY + 10, { align: 'right' });
  
  doc.setDrawColor(230, 230, 230);
  doc.line(14, currentY + 16, 283, currentY + 16);
  
  currentY += 25;

  const cards = document.querySelectorAll('#content .card, #content .home-stat-pill');
  if (cards.length > 0) {
    let cardX = 14;
    const cardWidth = 63;
    const cardHeight = 22;

    cards.forEach((card) => {
      const label = card.querySelector('.card-label, .home-stat-label')?.innerText || '';
      const value = card.querySelector('.card-value')?.innerText || '';
      
      if (!label && !value) return;

      if (cardX + cardWidth > 283) {
        cardX = 14;
        currentY += cardHeight + 6;
      }

      doc.setFillColor(248, 249, 250);
      doc.setDrawColor(220, 220, 220);
      doc.roundedRect(cardX, currentY, cardWidth, cardHeight, 2, 2, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...mutedColor);
      let shortLabel = label.length > 35 ? label.substring(0, 32) + '...' : label;
      doc.text(shortLabel.toUpperCase(), cardX + 5, currentY + 7);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.setTextColor(...brandColor);
      doc.text(value, cardX + 5, currentY + 17);

      cardX += cardWidth + 6;
    });
    
    currentY += cardHeight + 15;
  }

  const tables = document.querySelectorAll('#content table');
  let colPosition = 0;
  let startYForRow = currentY;
  let maxRowY = currentY;

  tables.forEach((table, index) => {
    let title = `Tabela ${index + 1}`;
    
    const panel = table.closest('.panel');
    if (panel) {
      const heading = panel.querySelector('h2, h3, h4');
      if (heading) title = heading.innerText;
    }
    
    if (title.startsWith('Tabela ')) {
      let current = table.parentElement;
      while (current && current.id !== 'content') {
        const prev = current.previousElementSibling;
        if (prev && /^H[1-6]$/.test(prev.tagName)) {
          title = prev.innerText;
          break;
        }
        current = current.parentElement;
      }
    }
    
    title = title.replace(/[\n\r]+|[\s]{2,}/g, ' ').trim();

    const { head, body } = extractCleanTableData(table);
    if (head.length === 0 && body.length === 0) return;

    const numCols = head[0] ? head[0].length : 0;
    const isNarrow = numCols > 0 && numCols <= 4;

    let startX = 14;
    let tableWidth = false;

    if (startYForRow > 170 || (colPosition === 0 && currentY > 170)) {
      doc.addPage();
      doc.setFillColor(...brandColor);
      doc.rect(0, 0, 297, 4, 'F');
      startYForRow = 20;
      currentY = 20;
      maxRowY = 20;
    }

    if (isNarrow) {
      if (colPosition === 0) {
        startX = 14;
        tableWidth = 130;
        startYForRow = currentY;
        colPosition = 1;
      } else {
        startX = 152;
        tableWidth = 130;
        currentY = startYForRow;
        colPosition = 0;
      }
    } else {
      if (colPosition === 1) {
        currentY = maxRowY + 15;
        colPosition = 0;
      }
      startX = 14;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...textColor);
    doc.text(title, startX, currentY);

    doc.autoTable({
      startY: currentY + 4,
      margin: { left: startX },
      tableWidth: tableWidth ? tableWidth : 'auto',
      head: head,
      body: body,
      theme: 'grid',
      headStyles: { 
        fillColor: [240, 240, 240],
        textColor: [40, 40, 40],
        fontStyle: 'bold',
        lineWidth: 0.1,
        lineColor: [220, 220, 220]
      },
      bodyStyles: { 
        textColor: [60, 60, 60],
        lineWidth: 0.1,
        lineColor: [235, 235, 235]
      },
      alternateRowStyles: { 
        fillColor: [252, 252, 252]
      },
      styles: { 
        font: 'helvetica', 
        fontSize: 9, 
        cellPadding: 4 
      },
    });

    if (doc.lastAutoTable.finalY > maxRowY) {
      maxRowY = doc.lastAutoTable.finalY;
    }

    if (colPosition === 1) {
      currentY = maxRowY;
    } else {
      currentY = maxRowY + 15;
    }
  });

  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.setDrawColor(240, 240, 240);
    doc.line(14, 200, 283, 200);
    doc.text('Australis Monitor - Uso Interno', 14, 205);
    doc.text(`Página ${i} de ${pageCount}`, 283, 205, { align: 'right' });
  }

  const filename = `Australis_Relatorio_${route}_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(filename);
  showToast('PDF gerado com sucesso!', 'success');
}

function exportToCSV() {
  const tables = document.querySelectorAll('#content table');
  if (tables.length === 0) {
    showToast('Nenhuma tabela encontrada nesta tela.', 'error');
    return;
  }

  const route = location.hash.replace('#', '') || 'homepage';
  const dateStr = new Date().toISOString().split('T')[0];
  let csvContent = "\uFEFF"; 

  tables.forEach((table, index) => {
    let title = `Tabela ${index + 1}`;
    const container = table.closest('.panel');
    if (container) {
      const h3 = container.querySelector('h3');
      if (h3) title = h3.innerText.trim();
    }
    
    csvContent += `${title}\n`; 

    const { head, body } = extractCleanTableData(table);
    
    if (head.length > 0) {
      csvContent += head[0].map(text => `"${text.replace(/"/g, '""')}"`).join(";") + "\n";
    }

    body.forEach(rowData => {
      csvContent += rowData.map(text => `"${text.replace(/"/g, '""')}"`).join(";") + "\n";
    });
    
    csvContent += "\n\n"; 
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `Australis_Dados_${route}_${dateStr}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  showToast('CSV exportado com sucesso!', 'success');
}
