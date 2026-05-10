FROM nginx:1.27-alpine

COPY index.html /usr/share/nginx/html/index.html
COPY README.md /usr/share/nginx/html/README.md
COPY context /usr/share/nginx/html/context

EXPOSE 80
