FROM node:18-slim

WORKDIR /app

# Instalacja zależności systemowych
RUN apt-get update && apt-get install -y python3 python3-pip git

# Preinstalacja Semgrep z obejściem ograniczeń środowiska zarządzanego
RUN pip3 install --break-system-packages semgrep

# Kopiowanie plików projektu
COPY . .

# Instalacja zależności Node i budowanie projektu
RUN npm install
RUN npm run build

# Sprawdzenie instalacji Semgrep
RUN semgrep --version

# Uruchomienie serwera
CMD ["node", "build/index.js"]