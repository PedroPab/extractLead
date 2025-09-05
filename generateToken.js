const jwt = require('jsonwebtoken');
const SECRET = process.env.TOKEN_SECRET;


// Recibe el JSON como argumento en línea de comandos (soporta espacios)
const [, , ...args] = process.argv;
const jsonArg = args.join(' ');

if (!jsonArg) {
    process.exit(1);
}

let payload;
try {
    payload = JSON.parse(jsonArg);
} catch (e) {
    console.error('El argumento no es un JSON válido.');
    process.exit(1);
}

const token = jwt.sign(payload, SECRET);
console.log(token);
