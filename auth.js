const jwt = require('jsonwebtoken');
const SECRET = process.env.TOKEN_SECRET;

function authMiddleware(req, res, next) {
    const token = req.headers['authorization'];
    if (!token) {
        return res.status(401).json({ error: 'No autorizado' });
    }
    jwt.verify(token, SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).json({ error: 'No autorizado' });
        }
        req.user = decoded;
        next();
    });
}

module.exports = { authMiddleware };
