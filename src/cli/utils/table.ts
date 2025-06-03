/**
 * Creates a simple table for console output
 */
export function createTable(headers: string[]) {
  const table: any = {
    // Store table data
    data: [headers],
    
    // Add a row to the table
    push: function(row: any[]) {
      this.data.push(row);
    },
    
    // Convert table to string
    toString: function() {
      // Calculate column widths
      const colWidths = Array(headers.length).fill(0);
      
      // Get maximum width for each column
      this.data.forEach((row: any[]) => {
        row.forEach((cell, i) => {
          const cellStr = String(cell);
          colWidths[i] = Math.max(colWidths[i], cellStr.length);
        });
      });
      
      // Create separator line
      const separator = colWidths.map(w => '-'.repeat(w + 2)).join('+');
      
      // Build table string
      let result = '';
      
      // Add header row
      result += '+-' + separator + '-+\n';
      result += '| ' + this.data[0].map((cell: any, i: number) => 
        String(cell).padEnd(colWidths[i])
      ).join(' | ') + ' |\n';
      
      // Add separator after header
      result += '+-' + separator + '-+\n';
      
      // Add data rows
      for (let i = 1; i < this.data.length; i++) {
        result += '| ' + this.data[i].map((cell: any, j: number) => 
          String(cell).padEnd(colWidths[j])
        ).join(' | ') + ' |\n';
      }
      
      // Add bottom border
      result += '+-' + separator + '-+';
      
      return result;
    }
  };
  
  return table;
} 