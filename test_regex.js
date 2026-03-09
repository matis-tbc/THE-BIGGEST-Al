const body = `Dear Matis,

This is a paragraph.
This is another paragraph.

Sincerely,
Matis Uhl de Morais
CU Hyperloop | Vice President
CU Boulder | Computer Science and Finance
720-544-1510 | mauh3771@colorado.edu`;

const signatureRegex = /^([^\n]*?)\nCU Hyperloop\s*\|\s*([^\n]*?)\nCU Boulder\s*\|\s*([^\n]*?)\n([^\n]*?\|[^\n]*?)$/gm;

let formattedBody = body.replace(signatureRegex, (match, name, role, major, contactDetails) => {
  return `<div style="font-family: Arial, sans-serif; line-height: 1.4; margin-top: 4px;">
  <span style="font-size: 12pt; color: #111;">${name.trim()}</span><br>
  <span style="font-size: 11pt;"><strong style="color: #CFB87C;">CU Hyperloop</strong> <span style="color: #666;">| ${role.trim()}</span></span><br>
  <span style="font-size: 11pt;"><strong style="color: #CFB87C;">CU Boulder</strong> <span style="color: #666;">| ${major.trim()}</span></span><br>
  <span style="font-size: 11pt; color: #666;">${contactDetails.trim()}</span>
</div>`;
});

const htmlBody = formattedBody.replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>');
console.log(htmlBody);
