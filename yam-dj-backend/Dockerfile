# =====================================================================
# YAM DJ Backend — Dockerfile multi-etapes (deployable sur Render)
# Etape 1 : compilation Maven dans un conteneur JDK 17
# Etape 2 : image runtime legere (JRE 17 + FFmpeg)
# =====================================================================

# --- Etape 1 : BUILD (Maven + JDK 17) ---
FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /build

# Copier d'abord le pom seul pour mettre en cache les dependances
COPY pom.xml .
RUN mvn -q dependency:go-offline -DskipTests || true

# Copier le code source et compiler (tests ignores pour le build CI/CD)
COPY src ./src
RUN mvn -q package -DskipTests

# --- Etape 2 : RUNTIME (JRE 17 + FFmpeg) ---
FROM eclipse-temurin:17-jre-jammy

# FFmpeg requis pour le traitement audio (HLS 128k/48k, mastering -14 LUFS,
# detection BPM, mix xfade)
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Recuperer le JAR produit par l'etape de build
COPY --from=build /build/target/yam-dj-backend-1.0.0.jar app.jar

EXPOSE 8080

# Optimisation memoire pour plan Render gratuit (512 Mo RAM, 1 CPU) :
# - SerialGC        : GC le plus leger en mono-CPU (pas de metadonnees de regions G1)
# - 60% de RAM max  : heap ~307 Mo, laisse la place au metaspace Hibernate (~130 Mo)
#                     + code cache + piles de threads (l'ancien reglage 75% + G1
#                     provoquait un OutOfMemoryError -> exit 1 pendant l'init Hibernate)
# - TieredStopAtLevel=1 : JIT C1 seul -> demarrage plus rapide sur CPU partage
# - Xss512k         : divise par 2 la pile des ~60 threads (Hikari/Tomcat/WS)
# PORT est injecte par Render si necessaire ; sinon 8080 par defaut
ENTRYPOINT ["sh", "-c", "java -XX:+UseSerialGC -XX:MaxRAMPercentage=60 -XX:TieredStopAtLevel=1 -XX:MaxMetaspaceSize=160m -Xss512k -Dserver.port=${PORT:-8080} -jar app.jar"]
