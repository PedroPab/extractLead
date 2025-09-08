import jwt from 'jsonwebtoken';
const SECRET = process.env.TOKEN_SECRET;

export function authMiddleware(req, res, next) {
    let token = req.headers['authorization'] || req.headers['Authorization'];
    if (token && (token.startsWith('Bearer ') || token.startsWith('bearer '))) {
        token = token.split(' ')[1];
    }
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
