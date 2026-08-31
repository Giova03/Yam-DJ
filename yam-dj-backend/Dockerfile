FROM eclipse-temurin:17-jdk-jammy

# FFmpeg requis pour le traitement audio (HLS, mastering, BPM)
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY target/yam-dj-backend-1.0.0.jar app.jar

EXPOSE 8080

ENV SERVER_PORT=8080

ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75.0", "-jar", "app.jar"]
