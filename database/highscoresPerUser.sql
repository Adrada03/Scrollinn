SELECT 
    u.username,
    COUNT(h.id) AS total_highscores
FROM users u
JOIN highscores h ON u.id = h.user_id
GROUP BY u.id, u.username
ORDER BY total_highscores DESC;