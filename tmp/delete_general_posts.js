import fs from 'fs';
import path from 'path';

const blogDir = path.join(process.cwd(), 'src/data/blog');
const files = fs.readdirSync(blogDir).filter(f => f.endsWith('.md'));

files.forEach(f => {
    const filePath = path.join(blogDir, f);
    const content = fs.readFileSync(filePath, 'utf8');
    const categoryMatch = content.match(/category:\s*(.*)/);
    const category = categoryMatch ? categoryMatch[1].replace(/['"]/g, '').trim() : 'General';

    if (category === 'General' || category === '[ENTER CATEGORY NAME HERE]') {
        console.log('Deleting:', f);
        fs.unlinkSync(filePath);
    } else {
        console.log('Keeping:', f, `(Category: ${category})`);
    }
});
