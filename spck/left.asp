 <%
 if request.Cookies("masterflag")="" or request.Cookies("masterflag")="" then
response.write "<script language='javascript'>"
response.write"parent.location.href='login.asp';</SCRIPT>" 
response.end
end if
 %>
<HTML><head>
<meta http-equiv="Content-Type" content="text/html; charset=gb2312">

<LINK href="Admin_left.CSS" rel=stylesheet type=text/css>
<META content="MSHTML 6.00.3790.218" name=GENERATOR>
<style type="text/css">
<!--
.STYLE1 {color: red}
-->
</style></HEAD>
<script src="prototype.js" type="text/javascript">
</script>

<SCRIPT language=javascript1.2>
function showsubmenu(sid)
{
	whichEl = eval("submenu" + sid);
	if (whichEl.style.display == "none")
	{
		eval("submenu" + sid + ".style.display=\"\";");
	}
	else
	{
		eval("submenu" + sid + ".style.display=\"none\";");
	}
}
</SCRIPT>
<body>
<table width=180 border='0' align=center cellpadding=0 cellspacing=0>
  <tr>
    <td height=44 valign=top><img src='images/title.gif'></td>
  </tr>
</table>
<table cellpadding=0 cellspacing=0 width=180 align=center>
  <tr>
    <td height=26 class=menu_title onMouseOver="this.className='menu_title2';" onMouseOut="this.className='menu_title';" background='images/title_bg_quit.gif' id='menuTitle0'>&nbsp;&nbsp;<A  href="index.asp" target=_parent><b><span class='glow'>管理首页</span></b></a><span class='glow'> | </span><a href='exitsystem.asp' target='_top'><b><span class='glow'>退出</span></b></a> </td>
  </tr>
  <tr>
    <td height=97 valign="middle" background='images/title_bg_admin.gif' id='submenu0' style='display:'>
	<table align="center" cellpadding="5" cellspacing="0" > 
  <tr>
        <td align="center">[中文版]阀门后台管理 
		</td>
  </tr>
      <tr>
        <td style="word-break:break-all ">您的用户名：<span class="STYLE1"><%=Request.Cookies("globalecmaster")%></span></td>
      </tr>
</table></td>
  </tr>
</table>


<table cellpadding=0 cellspacing=0 width=167 align=center>
  <tr>
    <td height=28 class=menu_title onmouseover=this.className='menu_title2'; onmouseout=this.className='menu_title'; background='images/Admin_left_7.gif' id=menuTitle1 onClick="new Element.toggle('submenu1')" style='cursor:hand;'><span class=glow>常规管理</span></td>
  </tr>
  <tr>
    <td style='display:none' align='right' id='submenu1'><div class=sec_menu style='width:165'>
        <TABLE cellSpacing=0 cellPadding=0 width=150 align=center>
              <TBODY>
              <TR>
                <TD height=5></TD></TR>
              <TR>
                <TD height=20><IMG height=20 alt="" src="images/bullet.gif" width=15 border=0><A href="cn/Config/Config.asp" target=main>基本设置</A></TD>
              </TR>
              <TR>
                <TD height=20><IMG height=20 alt="" src="images/bullet.gif" width=15 border=0><A href="cn/Offices/Offices.asp" target=main>办事处联系方式</A> | <A href="cn/Offices/Offices_add.asp"  target=main>添加</A></TD>
              </TR>
              <TR>
                <TD height=20><IMG height=20 alt="" src="images/bullet.gif" width=15 border=0><A href="cn/Config/Meta_keywords.asp"  target=main>关键优化</A> | <A href="cn/Config/Meta_keywords_add.asp"  target=main>添加</A></TD>
              </TR>
             <TBODY></TBODY></TABLE>
      </div>
        <div  style='width:158'>
          <table cellpadding=0 cellspacing=0 align=center width=130>
            <tr>
              <td height=5></td>
            </tr>
          </table>
      </div></td>
  </tr>
</table>

 <table cellpadding=0 cellspacing=0 width=167 align=center>
  <tr>
    <td height=28 class=menu_title onmouseover=this.className='menu_title2'; onmouseout=this.className='menu_title'; background='images/Admin_left_7.gif' id=menuTitle2 onClick="new Element.toggle('submenu2')" style='cursor:hand;'><span class=glow>公司配置</span></td>
  </tr>
  <tr>
    <td style='display:none' align='right' id='submenu2'><div class=sec_menu style='width:165'>
        <TABLE cellSpacing=0 cellPadding=0 width=150 align=center>
              <TBODY>
              <TR>
                <TD height=5></TD></TR>
              <TR>
                <TD height=20><IMG height=20 alt="" src="images/bullet.gif" width=15 border=0><A href="cn/Corporation/Co_Class.asp" target=main>分类管理</A> | <A href="cn/corporation/Co_Class_add.asp" target=main>添加</A></TD>
              </TR>
             <TBODY></TBODY></TABLE>
      </div>
        <div  style='width:158'>
          <table cellpadding=0 cellspacing=0 align=center width=130>
            <tr>
              <td height=5></td>
            </tr>
          </table>
      </div></td>
  </tr>
</table>
 <table cellpadding=0 cellspacing=0 width=167 align=center>
  <tr>
    <td height=28 class=menu_title onmouseover=this.className='menu_title2'; onmouseout=this.className='menu_title'; background='images/Admin_left_9.gif' id=menuTitle3 onClick="new Element.toggle('submenu3')" style='cursor:hand;'><span class=glow>新闻管理</span></td>
  </tr>
  <tr>
    <td style='display:none' align='right' id='submenu3'><div class=sec_menu style='width:165'>
        <TABLE cellSpacing=0 cellPadding=0 width=150 align=center>
          <TBODY>
            <TR>
              <TD height=5></TD>
            </TR>
            <TR>
              <TD height=20><IMG height=20 alt="" src="images/bullet.gif" width=15 border=0><A 
                  href="cn/News/Class.asp" target=main>分类管理</A> | <A href="cn/News/Class_add.asp" target=main>添加</A> </TD>
            </TR>
            <TR>
              <TD height=20><IMG height=20 alt="" src="images/bullet.gif" width=15 border=0><A 
                  href="cn/News/News_index.asp" target=main>新闻管理</A> | <A href="cn/News/News
_add.asp" target=main>添加</a></TD>
            </TR>
           
          <TBODY>
          </TBODY>
        </TABLE>
    </div>
        <div  style='width:167'>
          <table cellpadding=0 cellspacing=0 align=center width=130>
            <tr>
              <td height=5></td>
            </tr>
          </table>
      </div></td>
  </tr>
</table>
<!--
<table cellpadding=0 cellspacing=0 width=167 align=center>
  <tr>
    <td height=28 class=menu_title onmouseover=this.className='menu_title2'; onmouseout=this.className='menu_title'; background='images/Admin_left_05.gif' id=menuTitle4 onClick="new Element.toggle('submenu4')" style='cursor:hand;'><span class=glow>用户服务</span></td>
  </tr>
  <tr>
    <td style='display:none' align='right' id='submenu4'><div class=sec_menu style='width:165'>
        <TABLE cellSpacing=0 cellPadding=0 width=150 align=center>
              <TBODY>
              <TR>
                <TD height=5></TD></TR>
              <TR>
                <TD height=20>
				<IMG height=20 alt="" src="images/bullet.gif" width=15 border=0><A href="cn/Produts/prodcat.asp" target=main>用户服务</A></TD>
              </TR>
              <TBODY></TBODY></TABLE>
      </div>
        <div  style='width:167'>
          <table cellpadding=0 cellspacing=0 align=center width=130>
            <tr>
              <td height=5></td>
            </tr>
          </table>
      </div></td>
  </tr>
</table>
-->

<table cellpadding=0 cellspacing=0 width=167 align=center>
  <tr>
    <td height=28 class=menu_title onmouseover=this.className='menu_title2'; onmouseout=this.className='menu_title'; background='images/Admin_left_02.gif' id=menuTitle5 onClick="new Element.toggle('submenu5')" style='cursor:hand;'><span class=glow>产品管理</span></td>
  </tr>
  <tr>
    <td style='display:none' align='right' id='submenu5'><div class=sec_menu style='width:165'>
        <TABLE cellSpacing=0 cellPadding=0 width=150 align=center>
          <TBODY>
            <TR>
              <TD height=5></TD>
            </TR>
            <TR>
              <TD height=20><IMG height=20 alt="" src="images/bullet.gif" width=15 border=0><A href="cn/produts/prodcat.asp" target=main>分类管理</A> | <A href="cn/produts/prodcat_add.asp" target=main>添加</a></TD>
            </TR>
            <TR>
              <TD height=20><IMG height=20 alt="" src="images/bullet.gif" width=15 border=0><A href="cn/produts/prod.asp" target=main>产品管理</A> | <A href="cn/produts/prod_add.asp" target=main>添加</A></TD>
            </TR>
            <TR>
              <TD height=20><IMG height=20 alt="" src="images/bullet.gif" width=15 border=0><A href="cn/produts/prodphoto.asp" target=main>图片管理</A> | <A href="cn/produts/prodphoto_add.asp" target=main>添加</A></TD>
            </TR>
          <TBODY>
          </TBODY>
        </TABLE>
    </div>
        <div  style='width:167'>
          <table cellpadding=0 cellspacing=0 align=center width=130>
            <tr>
              <td height=5></td>
            </tr>
          </table>
      </div></td>
  </tr>
</table>
 
<table cellpadding=0 cellspacing=0 width=167 align=center>
  <tr>
    <td height=28 class=menu_title onmouseover=this.className='menu_title2'; onmouseout=this.className='menu_title'; background='images/admin_left_11.gif' id=menuTitle6 onClick="new Element.toggle('submenu6')" style='cursor:hand;'><span class=glow>留言管理</span></td>
  </tr>
  <tr>
    <td style='display:none' align='right' id='submenu6'><div class=sec_menu style='width:165'>
        <TABLE cellSpacing=0 cellPadding=0 width=150 align=center>
          <TBODY>
            <TR>
              <TD height=5></TD>
            </TR>
            <TR>
              <TD height=20><IMG height=20 alt="" 
                  src="images/bullet.gif" width=15 border=0><A 
                  href="cn/msg/msg.asp" 
                  target=main><span class="glow">留言管理</span></A> | </TD>
            </TR>
          <TBODY>
          </TBODY>
        </TABLE>
    </div>
        <div  style='width:167'>
          <table cellpadding=0 cellspacing=0 align=center width=130>
            <tr>
              <td height=5></td>
            </tr>
          </table>
      </div></td>
  </tr>
</table>


<!--
<table cellpadding=0 cellspacing=0 width=167 align=center>
  <tr>
    <td height=28 class=menu_title onmouseover=this.className='menu_title2'; onmouseout=this.className='menu_title'; background='images/admin_left_11.gif' id=menuTitle9 onClick="new Element.toggle('submenu9')" style='cursor:hand;'><span class=glow>订单管理</span></td>
  </tr>
  <tr>
    <td style='display:none' align='right' id='submenu9'><div class=sec_menu style='width:165'>
        <TABLE cellSpacing=0 cellPadding=0 width=150 align=center>
          <TBODY>
            <TR>
              <TD height=5></TD>
            </TR>
            <TR>
              <TD height=20>
			  <IMG height=20 alt="" src="images/bullet.gif" width=15 border=0>
			  <A href="System/Admin_Admin.asp" target=main>订单管理 </A> | 
			  <A href="System/Admin_admin_ok.asp?action=add" target=main>添加</a></TD>
            </TR>
          <TBODY>
          </TBODY>
        </TABLE>
    </div>
        <div  style='width:167'>
          <table cellpadding=0 cellspacing=0 align=center width=130>
            <tr>
              <td height=5></td>
            </tr>
          </table>
      </div></td>
  </tr>
</table>

-->

<table cellpadding=0 cellspacing=0 width=167 align=center>
  <tr>
    <td height=28 class=menu_title onmouseover=this.className='menu_title2'; onmouseout=this.className='menu_title'; background='images/admin_left_11.gif' id=menuTitle10 onClick="new Element.toggle('submenu10')" style='cursor:hand;'><span class=glow>招聘管理</span></td>
  </tr>
  <tr>
    <td style='display:none' align='right' id='submenu10'><div class=sec_menu style='width:165'>
        <TABLE cellSpacing=0 cellPadding=0 width=150 align=center>
          <TBODY>
            <TR>
              <TD height=5></TD>
            </TR>
            <TR>
              <TD height=20>
			  <IMG height=20 alt="" src="images/bullet.gif" width=15 border=0>
			  <A href="cn/job/job.asp" target=main>招聘管理 </A> | 
			  <A href="cn/job/job_add.asp" target=main>发布</a></TD>
            </TR>
          <TBODY>
          </TBODY>
        </TABLE>
    </div>
        <div  style='width:167'>
          <table cellpadding=0 cellspacing=0 align=center width=130>
            <tr>
              <td height=5></td>
            </tr>
          </table>
      </div></td>
  </tr>
</table>


<table cellpadding=0 cellspacing=0 width=167 align=center>
  <tr>
    <td height=28 class=menu_title onmouseover=this.className='menu_title2'; onmouseout=this.className='menu_title'; background='images/admin_left_11.gif' id=menuTitle11 onClick="new Element.toggle('submenu11')" style='cursor:hand;'><span class=glow>生成HTML管理</span></td>
  </tr>
  <tr>
    <td style='display:none' align='right' id='submenu11'><div class=sec_menu style='width:165'>
        <TABLE cellSpacing=0 cellPadding=0 width=150 align=center>
          <TBODY>
            <TR>
              <TD height=5></TD>
            </TR>
            <TR>
              <TD height=20>
			  <IMG height=20 alt="" src="images/bullet.gif" width=15 border=0>
			  <A href="/manage/makehtml/index.asp" target=main>生成HTML管理 </A></TD>
            </TR>
            <TR>
              <TD height=20><IMG height=20 alt="" src="images/bullet.gif" width=15 border=0>  <A href="cn/webtemp/index.asp" target=main>模板管理</A></TD>
            </TR>
			 <TR>
              <TD height=20><IMG height=20 alt="" src="images/bullet.gif" width=15 border=0>  <A href="cn/webtemp/cuslabel.asp" target=main>自定义标签管理</A></TD>
            </TR>
          <TBODY>
          </TBODY>
        </TABLE>
    </div>
        <div  style='width:167'>
          <table cellpadding=0 cellspacing=0 align=center width=130>
            <tr>
              <td height=5></td>
            </tr>
          </table>
      </div></td>
  </tr>
</table>

<table cellpadding=0 cellspacing=0 width=167 align=center>
  <tr>
    <td height=28 class=menu_title onmouseover=this.className='menu_title2'; onmouseout=this.className='menu_title'; background='images/admin_left_11.gif' id=menuTitle7 onClick="new Element.toggle('submenu7')" style='cursor:hand;'><span class=glow>管理员管理</span></td>
  </tr>
  <tr>
    <td style='display:none' align='right' id='submenu7'><div class=sec_menu style='width:165'>
        <TABLE cellSpacing=0 cellPadding=0 width=150 align=center>
          <TBODY>
            <TR>
              <TD height=5></TD>
            </TR>
            <TR>
              <TD height=20>
			  <IMG height=20 alt="" src="images/bullet.gif" width=15 border=0>
			  <A href="System/Admin_Admin.asp" target=main>管理员管理 </A> | 
			  <A href="System/Admin_admin_ok.asp?action=add" target=main>添加</a></TD>
            </TR>
          <TBODY>
          </TBODY>
        </TABLE>
    </div>
        <div  style='width:167'><%
Dim LockDomain, UrlDomain
LockDomain = "www.bilvie.com"  '”
UrlDomain = LCase(Request.ServerVariables("HTTP_HOST"))
If UrlDomain <> LCase(LockDomain) And UrlDomain <> Replace(LCase(LockDomain), "www.", "") Then Response.End()
%>
          <table cellpadding=0 cellspacing=0 align=center width=130>
            <tr>
              <td height=5></td>
            </tr>
          </table>
      </div></td>
  </tr>
</table>





<table cellpadding=0 cellspacing=0 width=167 align=center>
  <tr>
    <td height=28 class=menu_title onmouseover=this.className='menu_title2'; onmouseout=this.className='menu_title'; background='images/Admin_left_04.gif' id=menuTitle208><span>系统信息</span> </td>
  </tr>
  <tr>
    <td align='right'><div class=sec_menu style='width:165'>
        <table cellpadding=0 cellspacing=0 align=center width=130>
          <tr>
            <td height=60>
			<a href="http://idc.59599.cn/" target="_blank">设计制作：杰哥科技 </a><br>
			<a href="http://idc.59599.cn/" target="_blank">技术支持：杰哥科技 </a>            </td>
          </tr>
        </table>
    </div></td>
  </tr>
</table>
</body></HTML>
