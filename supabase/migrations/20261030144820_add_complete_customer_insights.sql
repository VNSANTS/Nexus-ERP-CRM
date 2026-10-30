-- Aggregate the CRM from the full tenant history instead of the 500-order
-- operational queue. Phone normalization matches the frontend's Brazilian
-- country-code handling while retaining customer records without orders.
CREATE OR REPLACE FUNCTION public.customer_insights(p_establishment_id uuid)
RETURNS TABLE (
  telefone text,
  nome text,
  tags text[],
  observacoes text,
  pedidos bigint,
  "totalGasto" numeric,
  "ticketMedio" numeric,
  "ultimoPedidoEm" timestamptz,
  "diasSemComprar" integer,
  status text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
  WITH customer_candidates AS (
    SELECT
      c.telefone,
      c.nome,
      c.tags,
      c.observacoes,
      CASE
        WHEN left(pg_catalog.regexp_replace(coalesce(c.telefone, ''), '[^0-9]', '', 'g'), 2) = '55'
          AND length(pg_catalog.regexp_replace(coalesce(c.telefone, ''), '[^0-9]', '', 'g')) IN (12, 13)
        THEN substr(pg_catalog.regexp_replace(coalesce(c.telefone, ''), '[^0-9]', '', 'g'), 3)
        ELSE pg_catalog.regexp_replace(coalesce(c.telefone, ''), '[^0-9]', '', 'g')
      END AS phone_key,
      row_number() OVER (
        PARTITION BY CASE
          WHEN left(pg_catalog.regexp_replace(coalesce(c.telefone, ''), '[^0-9]', '', 'g'), 2) = '55'
            AND length(pg_catalog.regexp_replace(coalesce(c.telefone, ''), '[^0-9]', '', 'g')) IN (12, 13)
          THEN substr(pg_catalog.regexp_replace(coalesce(c.telefone, ''), '[^0-9]', '', 'g'), 3)
          ELSE pg_catalog.regexp_replace(coalesce(c.telefone, ''), '[^0-9]', '', 'g')
        END
        ORDER BY c.updated_at DESC
      ) AS row_num
    FROM public.customers c
    WHERE c.establishment_id = p_establishment_id
  ), customer_rows AS (
    SELECT * FROM customer_candidates WHERE row_num = 1 AND phone_key <> ''
  ), order_aggregates AS (
    SELECT
      CASE
        WHEN left(pg_catalog.regexp_replace(coalesce(o.telefone, ''), '[^0-9]', '', 'g'), 2) = '55'
          AND length(pg_catalog.regexp_replace(coalesce(o.telefone, ''), '[^0-9]', '', 'g')) IN (12, 13)
        THEN substr(pg_catalog.regexp_replace(coalesce(o.telefone, ''), '[^0-9]', '', 'g'), 3)
        ELSE pg_catalog.regexp_replace(coalesce(o.telefone, ''), '[^0-9]', '', 'g')
      END AS phone_key,
      count(*) AS pedidos,
      sum(o.total) AS total_gasto,
      max(o.created_at) AS ultimo_pedido_em
    FROM public.orders o
    WHERE o.establishment_id = p_establishment_id
      AND o.status <> 'cancelado'
      AND pg_catalog.regexp_replace(coalesce(o.telefone, ''), '[^0-9]', '', 'g') <> ''
    GROUP BY 1
  ), merged AS (
    SELECT
      coalesce(c.telefone, a.phone_key) AS telefone,
      coalesce(c.nome, '') AS nome,
      coalesce(c.tags, ARRAY[]::text[]) AS tags,
      coalesce(c.observacoes, '') AS observacoes,
      coalesce(a.pedidos, 0) AS pedidos,
      coalesce(a.total_gasto, 0) AS total_gasto,
      CASE WHEN coalesce(a.pedidos, 0) > 0 THEN a.total_gasto / a.pedidos ELSE 0 END AS ticket_medio,
      a.ultimo_pedido_em,
      CASE WHEN a.ultimo_pedido_em IS NOT NULL
        THEN floor(extract(epoch FROM (statement_timestamp() - a.ultimo_pedido_em)) / 86400)::integer
        ELSE NULL
      END AS dias_sem_comprar
    FROM customer_rows c
    FULL OUTER JOIN order_aggregates a USING (phone_key)
  )
  SELECT
    telefone, nome, tags, observacoes, pedidos, total_gasto, ticket_medio,
    ultimo_pedido_em, dias_sem_comprar,
    CASE
      WHEN ultimo_pedido_em IS NULL THEN 'novo'
      WHEN dias_sem_comprar > 30 THEN 'inativo'
      WHEN dias_sem_comprar > 14 THEN 'em-risco'
      ELSE 'ativo'
    END AS status
  FROM merged
  ORDER BY total_gasto DESC, nome ASC, telefone ASC;
$$;

REVOKE ALL ON FUNCTION public.customer_insights(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.customer_insights(uuid) TO service_role;
