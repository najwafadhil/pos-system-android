const fs = require('fs');
const path = require('path');

const dir = './src/components';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.jsx'));

for (const file of files) {
    const filePath = path.join(dir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Replace single or double quoted strings starting with /api/
    content = content.replace(/['"]\/api\/([^'"]*)['"]/g, '`${process.env.REACT_APP_API_URL || ""}/api/$1`');
    
    // Replace template literals starting with /api/
    content = content.replace(/`\/api\/([^`]*)`/g, '`${process.env.REACT_APP_API_URL || ""}/api/$1`');
    
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Fixed', file);
}
