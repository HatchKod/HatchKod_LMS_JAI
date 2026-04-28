const fs = require('fs');
const path = require('path');

const srcDir = path.resolve(__dirname, 'src');

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(function(file) {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            results = results.concat(walk(file));
        } else if (file.endsWith('.js') || file.endsWith('.jsx')) {
            results.push(file);
        }
    });
    return results;
}

const files = walk(srcDir);

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    const originalContent = content;

    // Match imports like import ... from "@/..."
    content = content.replace(/(from\s+['"])@\/(.*?)(['"])/g, (match, p1, p2, p3) => {
        const targetPath = path.resolve(srcDir, p2);
        let relPath = path.relative(path.dirname(file), targetPath);
        if (!relPath.startsWith('.')) {
            relPath = './' + relPath;
        }
        // fix windows slashes just in case
        relPath = relPath.replace(/\\/g, '/');
        return p1 + relPath + p3;
    });
    
    // Also match direct imports like import "@/App.css"
    content = content.replace(/(import\s+['"])@\/(.*?)(['"])/g, (match, p1, p2, p3) => {
        const targetPath = path.resolve(srcDir, p2);
        let relPath = path.relative(path.dirname(file), targetPath);
        if (!relPath.startsWith('.')) {
            relPath = './' + relPath;
        }
        relPath = relPath.replace(/\\/g, '/');
        return p1 + relPath + p3;
    });

    if (content !== originalContent) {
        fs.writeFileSync(file, content, 'utf8');
        console.log(`Updated ${file}`);
    }
});
