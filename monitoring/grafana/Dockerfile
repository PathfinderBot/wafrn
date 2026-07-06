FROM grafana/grafana:13.0

ENV GF_INSTALL_PLUGINS=marcusolsson-treemap-panel

COPY datasources /etc/grafana/provisioning/datasources
COPY dashboards /var/lib/grafana/dashboards

COPY dashboards.yml /etc/grafana/provisioning/dashboards/pgwatch_dashboards.yml
