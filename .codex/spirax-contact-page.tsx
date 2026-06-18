import React from 'react';

export default function Template(props) {
  const shell = props.component('spirax_shell', props);
  const title = props.title || '联系我们';
  const masthead = props.component('spirax_short_masthead', {
    title,
    image: props.image || '',
    imageAlt: title,
    className: 'short-masthead'
  });
  const content = (
    <main className="sg-page-shell sg-content-shell sg-contact-page">
      {masthead}
      <section className="bg--white">
        <div className="wrapper wrapper--sml wrapper--pad-l">
          <div className="copy">
            <p>{props.site?.company_name || props.site?.web_name}</p>
            {props.site?.company_phone ? <p>电话：{props.site.company_phone}</p> : null}
            {props.site?.company_email ? <p>邮箱：{props.site.company_email}</p> : null}
            {props.site?.company_address ? <p>地址：{props.site.company_address}</p> : null}
          </div>
        </div>
      </section>
    </main>
  );
  return shell ? React.cloneElement(shell, {}, content) : content;
}
