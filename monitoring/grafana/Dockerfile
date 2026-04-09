FROM grafana/grafana:12.0

COPY datasources /etc/grafana/provisioning/datasources
COPY dashboards /var/lib/grafana/dashboards

COPY dashboards.yml /etc/grafana/provisioning/dashboards/pgwatch_dashboards.yml

RUN grafana-cli plugins install marcusolsson-treemap-panel
