-- Color del producto (para el filtro de la tienda). Un color por producto: "Negro", "Azul"...
ALTER TABLE products ADD COLUMN color TEXT NOT NULL DEFAULT '';

-- Completa el color de los productos de demostración si todavía no tienen uno
UPDATE products SET color = 'Azul'   WHERE slug = 'malla-ocean-blue'  AND color = '';
UPDATE products SET color = 'Negro'  WHERE slug = 'malla-black-wave'  AND color = '';
UPDATE products SET color = 'Coral'  WHERE slug = 'malla-sunset-palm' AND color = '';
UPDATE products SET color = 'Rojo'   WHERE slug = 'malla-coral-reef'  AND color = '';
UPDATE products SET color = 'Verde'  WHERE slug = 'malla-salt-sage'   AND color = '';
UPDATE products SET color = 'Verde'  WHERE slug = 'malla-deep-teal'   AND color = '';
