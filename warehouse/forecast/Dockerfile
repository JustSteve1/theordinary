FROM python:3.11-slim

# Current commit of amazon/chronos-2 on the Hub at pin time:
# HfApi().model_info("amazon/chronos-2").sha
ARG MODEL_REVISION=29ec3766d36d6f73f0696f85560a422f50e8498c

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

RUN pip install torch==2.9.1 --index-url https://download.pytorch.org/whl/cpu

COPY requirements.txt .
RUN pip install -r requirements.txt

# Download the model once at build time so the running job never reaches the Hub.
ENV MODEL_REVISION=$MODEL_REVISION
RUN python -c "import os; from huggingface_hub import snapshot_download; \
    snapshot_download('amazon/chronos-2', revision=os.environ['MODEL_REVISION'], local_dir='/models/chronos-2')"

ENV HF_HUB_OFFLINE=1 \
    MODEL_DIR=/models/chronos-2

COPY bands.py forecast.py ./

CMD ["python", "forecast.py"]
