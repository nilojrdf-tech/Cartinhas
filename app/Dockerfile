# Cartinhas — imagem do aplicativo.
#
# Node 24 oficial: o SQLite vem dentro do proprio Node (modulo node:sqlite), entao a imagem
# nao instala nada. Sem npm install, sem compilador, sem dependencia de rede no build —
# importante numa VPS de 1 vCPU, que e a mesma do ROTA.
#
# Precisa ser Node 22.5 ou mais novo: abaixo disso nao existe node:sqlite.

FROM node:24-alpine

ENV NODE_ENV=production \
    TZ=America/Sao_Paulo \
    CARTINHAS_PORTA=8080 \
    CARTINHAS_DADOS=/dados

WORKDIR /app

# So o que o servidor precisa. Testes, scripts de montagem e o migrador ficam de fora
# (ver .dockerignore): o que entra na imagem e o que roda em producao.
COPY servidor.js ./
COPY lib ./lib
COPY web ./web

# O volume /dados e montado pelo EasyPanel; /backups e o segundo volume, das copias.
RUN mkdir -p /dados /backups && chown -R node:node /dados /backups /app

# Nunca como root.
USER node

EXPOSE 8080

# O painel usa isto para saber se o aplicativo esta de pe. /api/saude nao exige sessao e
# nao devolve dado de ponto nenhum.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.CARTINHAS_PORTA||8080)+'/api/saude').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "servidor.js"]
