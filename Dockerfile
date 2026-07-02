FROM node

ARG PACKAGE_VERSION=latest

RUN npm install -g "@moontaiworks/fanbox-dl@${PACKAGE_VERSION#v}"

ENTRYPOINT ["fanbox-dl"]
